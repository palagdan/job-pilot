import type { Db } from '@job-pilot/db/client';
import type { JobQueue } from '@job-pilot/jobs/client';
import type { Llm } from '@job-pilot/llm/client';
import type { FileStorage } from '@job-pilot/storage/file-storage';
import type { Log } from '../log.ts';
import { parseCv } from './parse-cv.ts';

export type HandlerDeps = { db: Db; queue: JobQueue; storage: FileStorage; llm: Llm; log: Log };

/** The single place that maps job name to handler. */
export const registerHandlers = async (
  deps: HandlerDeps,
  { concurrency }: { concurrency: number },
) => {
  await deps.queue.work('cv.parse', parseCv(deps), { concurrency });
};
