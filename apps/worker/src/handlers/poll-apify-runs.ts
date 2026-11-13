import type { ApifyClient } from '@job-pilot/apify/client';
import { toSourceRunStatus } from '@job-pilot/apify/run-status';
import type { Db } from '@job-pilot/db/client';
import { sourceRun } from '@job-pilot/db/schema/sources';
import type { JobHandler, JobQueue } from '@job-pilot/jobs/client';
import { eq } from 'drizzle-orm';
import type { Log } from '../log.ts';
import { STALE_RUN_MS } from './start-source-run.ts';

export type PollApifyRunsDeps = {
  db: Db;
  apify: Pick<ApifyClient, 'getRun' | 'getDatasetItemCount'>;
  queue: Pick<JobQueue, 'send'>;
  log: Log;
};

const MAX_RUNS_PER_POLL = 20;

export const pollApifyRuns =
  ({ db, apify, queue, log }: PollApifyRunsDeps): JobHandler<'apify.poll-runs'> =>
  async () => {
    const runs = await db
      .select()
      .from(sourceRun)
      .where(eq(sourceRun.status, 'running'))
      .limit(MAX_RUNS_PER_POLL);

    for (const run of runs) {
      try {
        const apifyRun = await apify.getRun(run.apifyRunId);
        const status = toSourceRunStatus(apifyRun.status);

        if (status === 'running') {
          if (Date.now() - run.startedAt.getTime() > STALE_RUN_MS) {
            await db
              .update(sourceRun)
              .set({ status: 'timed_out', finishedAt: new Date(), error: 'stale' })
              .where(eq(sourceRun.id, run.id));
            log.warn('apify run stale', { apifyRunId: run.apifyRunId });
          }
          continue;
        }

        const datasetId = apifyRun.defaultDatasetId ?? run.apifyDatasetId;
        const itemsCount = datasetId ? await apify.getDatasetItemCount(datasetId) : null;
        await db
          .update(sourceRun)
          .set({
            status,
            finishedAt: apifyRun.finishedAt ? new Date(apifyRun.finishedAt) : new Date(),
            costUsd: apifyRun.usageTotalUsd == null ? null : String(apifyRun.usageTotalUsd),
            itemsCount,
            error: status === 'succeeded' ? null : (apifyRun.statusMessage ?? apifyRun.status),
          })
          .where(eq(sourceRun.id, run.id));
        log.info('apify run finished', { apifyRunId: run.apifyRunId, status, itemsCount });

        if (status === 'succeeded')
          await queue.send('apify.ingest-dataset', { sourceRunId: run.id });
      } catch (error) {
        log.error('apify poll failed for run', {
          apifyRunId: run.apifyRunId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
