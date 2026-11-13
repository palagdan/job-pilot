import type { Db } from '@job-pilot/db/client';
import { agentRun } from '@job-pilot/db/schema/agent';
import { opportunity } from '@job-pilot/db/schema/opportunities';
import { followUp, pipelineItem } from '@job-pilot/db/schema/pipeline';
import { eventListing, jobPosting } from '@job-pilot/db/schema/sources';
import type { RunDigestData } from '@job-pilot/emails/templates/run-digest';
import type { JobHandler, JobQueue } from '@job-pilot/jobs/client';
import { and, count, eq, lte } from 'drizzle-orm';
import type { Log } from '../log.ts';

/** "Company A" for a job, the event title for an event. */
const companyOf = (r: { company: string | null; eventTitle: string | null }) =>
  r.company ?? r.eventTitle ?? '';

/**
 * Email 04 "Run digest": after a run, if it found something new, asks `email.send` for one digest
 * (`run_digest:<runId>`, so a retried run never mails twice). `email.send` applies the user's settings
 * (paused, unsubscribed, notify_email off → skipped).
 */
export const runDigest =
  ({
    db,
    queue,
    log,
    now = () => new Date(),
  }: {
    db: Db;
    queue: Pick<JobQueue, 'send'>;
    log: Log;
    now?: () => Date;
  }): JobHandler<'email.run-digest'> =>
  async ({ data: { runId } }) => {
    const [run] = await db
      .select({ userId: agentRun.userId, status: agentRun.status })
      .from(agentRun)
      .where(eq(agentRun.id, runId));
    if (run?.status !== 'succeeded') {
      log.info('run digest skipped', {
        runId,
        reason: run ? `run ${run.status}` : 'run not found',
      });
      return;
    }

    const found = await db
      .select({ type: opportunity.type, n: count() })
      .from(opportunity)
      .where(and(eq(opportunity.agentRunId, runId), eq(opportunity.feedStatus, 'new')))
      .groupBy(opportunity.type);
    const newJobs = found.find((f) => f.type === 'job')?.n ?? 0;
    const newEvents = found.find((f) => f.type === 'event')?.n ?? 0;
    if (newJobs + newEvents === 0) {
      log.info('run digest skipped', { runId, reason: 'nothing new' });
      return;
    }

    const names = { company: jobPosting.company, eventTitle: eventListing.title };
    const ready = await db
      .select(names)
      .from(pipelineItem)
      .innerJoin(opportunity, eq(opportunity.id, pipelineItem.opportunityId))
      .leftJoin(jobPosting, eq(jobPosting.id, opportunity.jobPostingId))
      .leftJoin(eventListing, eq(eventListing.id, opportunity.eventListingId))
      .where(and(eq(pipelineItem.userId, run.userId), eq(pipelineItem.status, 'ready_to_send')));
    const due = await db
      .select(names)
      .from(followUp)
      .innerJoin(pipelineItem, eq(pipelineItem.id, followUp.pipelineItemId))
      .innerJoin(opportunity, eq(opportunity.id, pipelineItem.opportunityId))
      .leftJoin(jobPosting, eq(jobPosting.id, opportunity.jobPostingId))
      .leftJoin(eventListing, eq(eventListing.id, opportunity.eventListingId))
      .where(
        and(
          eq(pipelineItem.userId, run.userId),
          eq(followUp.status, 'pending'),
          lte(followUp.dueAt, now()),
        ),
      );

    const data: RunDigestData = {
      newJobs,
      newEvents,
      readyToSend: { count: ready.length, companies: ready.map(companyOf) },
      followUpsDue: { count: due.length, companies: due.map(companyOf) },
    };
    await queue.send('email.send', {
      template: 'run_digest',
      userId: run.userId,
      dedupeKey: `run_digest:${runId}`,
      data,
    });
    log.info('run digest enqueued', {
      runId,
      newJobs,
      newEvents,
      ready: ready.length,
      due: due.length,
    });
  };
