import type { ApifyClient } from '@job-pilot/apify/client';
import type { Db } from '@job-pilot/db/client';
import type { JobQueue } from '@job-pilot/jobs/client';
import type { Llm } from '@job-pilot/llm/client';
import type { FileStorage } from '@job-pilot/storage/file-storage';
import type { Log } from '../log.ts';
import { parseCv } from './parse-cv.ts';
import { pollApifyRuns } from './poll-apify-runs.ts';
import { startSourceRun } from './start-source-run.ts';

export type HandlerDeps = {
  db: Db;
  queue: JobQueue;
  storage: FileStorage;
  llm: Llm;
  apify: ApifyClient;
  log: Log;
  apifyLimits: { maxItems: number; maxChargeUsd: number };
};

/** The single place that maps job name to handler. */
export const registerHandlers = async (
  deps: HandlerDeps,
  { concurrency }: { concurrency: number },
) => {
  const { queue, apifyLimits } = deps;
  await queue.work('cv.parse', parseCv(deps), { concurrency });
  await queue.work('source.run', startSourceRun({ ...deps, ...apifyLimits }), { concurrency });
  await queue.work('apify.poll-runs', pollApifyRuns(deps));
  // apify.ingest-dataset has no handler yet (next task).
};
