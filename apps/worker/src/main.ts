import { createApifyClient } from '@job-pilot/apify/client';
import { createDb } from '@job-pilot/db/client';
import { createEmailSenderFromEnv } from '@job-pilot/emails/sender';
import { createJobQueue } from '@job-pilot/jobs/client';
import { jobs } from '@job-pilot/jobs/definitions';
import { createLlmFromEnv } from '@job-pilot/llm/from-env';
import { createDbUsageRecorder } from '@job-pilot/llm/usage';
import { createFileStorageFromEnv } from '@job-pilot/storage/from-env';
import { env } from './env.ts';
import { registerHandlers } from './handlers/register.ts';
import { log } from './log.ts';
import { createWebPushSender } from './push/push-sender.ts';
import { scheduleSources } from './sources/schedule-sources.ts';

const { db, close } = createDb(env.DATABASE_URL);
const queue = createJobQueue({ connectionString: env.DATABASE_URL });

const storage = createFileStorageFromEnv(env);
const llm = createLlmFromEnv(env, { recordUsage: createDbUsageRecorder(db) });

const apify = createApifyClient({ token: env.APIFY_TOKEN });
const push =
  env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
    ? createWebPushSender({
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
        subject: env.VAPID_SUBJECT,
      })
    : undefined;

queue.onError((error) => log.error('queue error', { error: error.message }));
await queue.start();
await registerHandlers(
  {
    db,
    queue,
    storage,
    llm,
    apify,
    push,
    log,
    agentMaxCandidates: env.AGENT_MAX_CANDIDATES,
    apifyLimits: { maxItems: env.APIFY_MAX_ITEMS, maxChargeUsd: env.APIFY_MAX_CHARGE_USD },
    email: {
      sender: createEmailSenderFromEnv(env, (message) => log.info(message)),
      webUrl: env.WEB_URL,
      apiUrl: env.API_URL,
      unsubscribeSecret: env.BETTER_AUTH_SECRET,
    },
  },
  { concurrency: env.WORKER_CONCURRENCY },
);
await scheduleSources({ db, queue, log });

log.info('worker ready', { queues: Object.keys(jobs).length });

const shutdown = async (signal: string) => {
  log.info('shutting down', { signal });
  await queue.stop({ graceful: true });
  await close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
