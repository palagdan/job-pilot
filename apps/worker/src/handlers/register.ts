import type { Db } from '@job-pilot/db/client';
import type { JobQueue } from '@job-pilot/jobs/client';
import type { Log } from '../log.ts';

export type HandlerDeps = { db: Db; queue: JobQueue; log: Log };

/** The single place that maps job name to handler. */
export const registerHandlers = async (_deps: HandlerDeps, _options: { concurrency: number }) => {
  // await queue.work('cv.parse', parseCv(deps), { concurrency });
};
