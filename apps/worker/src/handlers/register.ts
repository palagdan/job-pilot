import type { ApifyClient } from '@job-pilot/apify/client';
import type { Db } from '@job-pilot/db/client';
import type { EmailSender } from '@job-pilot/emails/sender';
import type { JobQueue } from '@job-pilot/jobs/client';
import type { Llm } from '@job-pilot/llm/client';
import type { FileStorage } from '@job-pilot/storage/file-storage';
import type { Log } from '../log.ts';
import { agentRunHandler } from './agent-run.ts';
import { expirePostings } from './expire-postings.ts';
import { finishSetupReminders } from './finish-setup-reminders.ts';
import { generateMasterCv } from './generate-master-cv.ts';
import { ingestDataset } from './ingest-dataset.ts';
import { parseCv } from './parse-cv.ts';
import { pollApifyRuns } from './poll-apify-runs.ts';
import { runDigest } from './run-digest.ts';
import { sendEmail } from './send-email.ts';
import { startSourceRun } from './start-source-run.ts';

export type HandlerDeps = {
  db: Db;
  queue: JobQueue;
  storage: FileStorage;
  llm: Llm;
  apify: ApifyClient;
  log: Log;
  apifyLimits: { maxItems: number; maxChargeUsd: number };
  agentMaxCandidates?: number;
  email: { sender: EmailSender; webUrl: string; apiUrl: string; unsubscribeSecret: string };
};

/** The single place that maps job name to handler. */
export const registerHandlers = async (
  deps: HandlerDeps,
  { concurrency }: { concurrency: number },
) => {
  const { queue, apifyLimits, email } = deps;
  await queue.work('cv.parse', parseCv(deps), { concurrency });
  await queue.work('cv.generate-master', generateMasterCv(deps), { concurrency });
  await queue.work(
    'agent.run',
    agentRunHandler({ ...deps, maxCandidates: deps.agentMaxCandidates }),
    { concurrency },
  );
  await queue.work('source.run', startSourceRun({ ...deps, ...apifyLimits }), { concurrency });
  await queue.work('apify.poll-runs', pollApifyRuns(deps));
  await queue.work('apify.ingest-dataset', ingestDataset(deps), { concurrency: 1 });
  await queue.work('ingest.expire', expirePostings(deps));
  await queue.work('email.send', sendEmail({ ...deps, ...email }), { concurrency });
  await queue.work('email.finish-setup-reminders', finishSetupReminders(deps));
  await queue.work('email.run-digest', runDigest(deps), { concurrency });
};
