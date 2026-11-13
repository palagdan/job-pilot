import type { Llm } from '@job-pilot/llm/client';
import { rankEventPrompt, rankEventSchema } from '@job-pilot/llm/prompts/rank-event';
import { rankJobPrompt, rankJobSchema } from '@job-pilot/llm/prompts/rank-job';
import type { Log } from '../log.ts';
import type { EventCandidate, JobCandidate } from './prefilter.ts';

export type RankProfile = {
  fullName: string | null;
  currentTitle: string | null;
  experience: string | null;
  location: string | null;
  skills: string[];
  summary: string | null;
  languages: { language: string; level: string }[];
  proofs: string[];
};

export type RankTargets = {
  roles: string[];
  locations: string[];
  workFormats: string[];
  exclusions: string[];
};

export type Ranked = { id: string; fitScore: number; why: string; gapNote: string | null };

const EXPERIENCE: Record<string, string> = {
  lt_1: 'less than 1 year',
  '1_3': '1-3 years',
  '3_5': '3-5 years',
  '5_10': '5-10 years',
  '10_plus': '10+ years',
};

const line = (label: string, value: string | null | undefined) =>
  value?.trim() ? `${label}: ${value.trim()}` : null;

export const profileText = (p: RankProfile): string =>
  [
    line('Name', p.fullName),
    line('Current title', p.currentTitle),
    line('Experience', p.experience ? (EXPERIENCE[p.experience] ?? p.experience) : null),
    line('Based in', p.location),
    line('Skills', p.skills.join(', ')),
    line('Languages', p.languages.map((l) => `${l.language} (${l.level})`).join(', ')),
    line('Summary', p.summary),
    p.proofs.length > 0 ? `Projects and proof:\n${p.proofs.map((x) => `- ${x}`).join('\n')}` : null,
  ]
    .filter(Boolean)
    .join('\n');

export const targetsText = (t: RankTargets): string =>
  [
    line('Target roles', t.roles.join(', ')),
    line('Target locations', t.locations.join(', ')),
    line('Work formats', t.workFormats.join(', ')),
    line('Exclusions', t.exclusions.join(', ')),
  ]
    .filter(Boolean)
    .join('\n');

type RankDeps = {
  llm: Pick<Llm, 'generateObject'>;
  log: Log;
  userId: string;
  agentRunId: string;
  profile: string;
  targets: string;
};

const settle = async <T>(
  items: T[],
  getId: (item: T) => string,
  rank: (item: T) => Promise<{ fitScore: number; why: string; gapNote: string | null }>,
  log: Log,
  kind: string,
): Promise<Ranked[]> => {
  const results = await Promise.allSettled(items.map(rank));
  const out: Ranked[] = [];
  results.forEach((result, i) => {
    const item = items[i] as T;
    if (result.status === 'fulfilled') {
      out.push({ id: getId(item), ...result.value });
    } else {
      const reason = result.reason;
      log.warn(`agent.run ${kind} ranking failed`, {
        id: getId(item),
        error: reason instanceof Error ? reason.message : String(reason),
      });
    }
  });
  return out;
};

export const rankJobs = (
  { llm, log, userId, agentRunId, profile, targets }: RankDeps,
  jobs: JobCandidate[],
) =>
  settle(
    jobs,
    (j) => j.id,
    async (job) => {
      const { object } = await llm.generateObject({
        task: 'rank',
        prompt: rankJobPrompt,
        userId,
        agentRunId,
        schema: rankJobSchema,
        messages: rankJobPrompt.messages({
          profile,
          targets,
          job: {
            title: job.title,
            company: job.company,
            location: job.city ?? job.locationRaw ?? 'unknown',
            description: job.description?.trim() || '(no description)',
          },
        }),
      });
      return object;
    },
    log,
    'job',
  );

export const rankEvents = (
  { llm, log, userId, agentRunId, profile, targets }: RankDeps,
  events: EventCandidate[],
) =>
  settle(
    events,
    (e) => e.id,
    async (event) => {
      const { object } = await llm.generateObject({
        task: 'rank',
        prompt: rankEventPrompt,
        userId,
        agentRunId,
        schema: rankEventSchema,
        messages: rankEventPrompt.messages({
          profile,
          targets,
          event: {
            title: event.title,
            organizer: event.organizer ?? 'unknown',
            location: event.online ? 'online' : (event.city ?? 'unknown'),
            startsAt: event.startsAt.toISOString(),
            description: event.description?.trim() || '(no description)',
          },
        }),
      });
      return object;
    },
    log,
    'event',
  );
