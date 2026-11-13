import type { Db } from '@job-pilot/db/client';
import { agentRun } from '@job-pilot/db/schema/agent';
import { opportunity } from '@job-pilot/db/schema/opportunities';
import { profile, profileProof, schedule, targets } from '@job-pilot/db/schema/profile';
import type { JobHandler } from '@job-pilot/jobs/client';
import type { Llm } from '@job-pilot/llm/client';
import { type RunStepKey, type RunStepStatus, runStepKeys } from '@job-pilot/shared/enums';
import { and, asc, eq } from 'drizzle-orm';
import {
  type EventCandidate,
  type JobCandidate,
  selectEventCandidates,
  selectJobCandidates,
} from '../agent/prefilter.ts';
import { profileText, type Ranked, rankEvents, rankJobs, targetsText } from '../agent/rank.ts';
import type { Log } from '../log.ts';

export type AgentRunDeps = {
  db: Db;
  llm: Pick<Llm, 'generateObject'>;
  log: Log;
  /** Cap on job candidates ranked per run (env AGENT_MAX_CANDIDATES). */
  maxCandidates?: number;
};

/** A score at or above this counts as "new" for the run's summary. */
export const NEW_SCORE_THRESHOLD = 50;
const EVENT_LIMIT = 10;

class RunError extends Error {}

/**
 * One agent run for one user: prefilter postings and events in SQL, rank them with the LLM, store the results
 * as opportunities. Errors end the run as `failed`; they are not rethrown (the user can press "Run now" again).
 */
export const agentRunHandler =
  ({ db, llm, log, maxCandidates = 25 }: AgentRunDeps): JobHandler<'agent.run'> =>
  async ({ data: { runId } }) => {
    const [claimed] = await db
      .update(agentRun)
      .set({
        status: 'running',
        startedAt: new Date(),
        steps: runStepKeys.map((key) => ({ key, status: 'waiting' as RunStepStatus })),
      })
      .where(and(eq(agentRun.id, runId), eq(agentRun.status, 'queued')))
      .returning();
    if (!claimed) {
      log.info('agent.run skipped: not queued', { runId });
      return;
    }
    const userId = claimed.userId;
    const steps = new Map<RunStepKey, RunStepStatus>(runStepKeys.map((k) => [k, 'waiting']));
    let current: RunStepKey | null = null;

    const setStep = async (key: RunStepKey, status: RunStepStatus) => {
      steps.set(key, status);
      current = status === 'in_progress' ? key : current;
      await db
        .update(agentRun)
        .set({ steps: runStepKeys.map((k) => ({ key: k, status: steps.get(k) ?? 'waiting' })) })
        .where(eq(agentRun.id, runId));
    };

    try {
      const [prof] = await db.select().from(profile).where(eq(profile.userId, userId));
      const [target] = await db.select().from(targets).where(eq(targets.userId, userId));
      if (!prof) throw new RunError('Profile is missing');
      if (!target) throw new RunError('Targets are missing');
      const proofs = await db
        .select({ text: profileProof.text })
        .from(profileProof)
        .where(eq(profileProof.userId, userId))
        .orderBy(asc(profileProof.position));

      await setStep('read_postings', 'in_progress');
      const jobs: JobCandidate[] = target.findJobs
        ? await selectJobCandidates(db, {
            userId,
            targets: target,
            profile: prof,
            limit: maxCandidates,
          })
        : [];
      await setStep('read_postings', 'done');

      await setStep('check_sources', 'in_progress');
      const events: EventCandidate[] = target.findEvents
        ? await selectEventCandidates(db, { userId, targets: target, limit: EVENT_LIMIT })
        : [];
      await setStep('check_sources', 'done');

      await setStep('rank_matches', 'in_progress');
      const deps = {
        llm,
        log,
        userId,
        agentRunId: runId,
        profile: profileText({ ...prof, proofs: proofs.map((p) => p.text) }),
        targets: targetsText(target),
      };
      const [rankedJobs, rankedEvents] = await Promise.all([
        rankJobs(deps, jobs),
        rankEvents(deps, events),
      ]);
      const candidates = jobs.length + events.length;
      if (candidates > 0 && rankedJobs.length + rankedEvents.length === 0) {
        throw new RunError('Ranking failed for every candidate');
      }
      await setStep('rank_matches', 'done');

      await setStep('prepare_digest', 'in_progress');
      const rows = [
        ...rankedJobs.map((r) => ({ r, type: 'job' as const })),
        ...rankedEvents.map((r) => ({ r, type: 'event' as const })),
      ].map(({ r, type }) => toRow(userId, runId, type, r));
      if (rows.length > 0) await db.insert(opportunity).values(rows).onConflictDoNothing();
      const newCount = [...rankedJobs, ...rankedEvents].filter(
        (r) => r.fitScore >= NEW_SCORE_THRESHOLD,
      ).length;
      await setStep('prepare_digest', 'done');

      const now = new Date();
      await db
        .update(agentRun)
        .set({ status: 'succeeded', candidatesCount: candidates, newCount, finishedAt: now })
        .where(eq(agentRun.id, runId));
      await db.update(schedule).set({ lastRunAt: now }).where(eq(schedule.userId, userId));
      log.info('agent.run done', { runId, userId, candidates, ranked: rows.length, newCount });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('agent.run failed', { runId, userId, error: message });
      try {
        if (current && steps.get(current) === 'in_progress') await setStep(current, 'failed');
        await db
          .update(agentRun)
          .set({ status: 'failed', error: message.slice(0, 500), finishedAt: new Date() })
          .where(eq(agentRun.id, runId));
      } catch (inner) {
        log.error('agent.run could not record failure', { runId, error: String(inner) });
      }
    }
  };

const toRow = (userId: string, runId: string, type: 'job' | 'event', r: Ranked) => ({
  userId,
  agentRunId: runId,
  type,
  jobPostingId: type === 'job' ? r.id : null,
  eventListingId: type === 'event' ? r.id : null,
  fitScore: r.fitScore,
  why: r.why,
  gapNote: r.gapNote,
  route: type === 'job' ? ('direct' as const) : ('event' as const),
  routeReason: type === 'job' ? 'Apply on the company page' : 'Register and prep talking points',
  feedStatus: 'new' as const,
});
