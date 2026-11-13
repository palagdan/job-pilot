import { createDb } from '@job-pilot/db/client';
import { createJobQueue } from '@job-pilot/jobs/client';
import { jobs } from '@job-pilot/jobs/definitions';
import { createLlmFromEnv } from '@job-pilot/llm/from-env';
import { createDbUsageRecorder } from '@job-pilot/llm/usage';
import { createS3FileStorage } from '@job-pilot/storage/s3-file-storage';
import { env } from './env.ts';
import { registerHandlers } from './handlers/register.ts';
import { log } from './log.ts';

const { db, close } = createDb(env.DATABASE_URL);
const queue = createJobQueue({ connectionString: env.DATABASE_URL });

const storage = createS3FileStorage({
  bucket: env.S3_BUCKET,
  region: env.S3_REGION,
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  endpoint: env.S3_ENDPOINT,
  publicEndpoint: env.S3_PUBLIC_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
});
const llm = createLlmFromEnv(env, { recordUsage: createDbUsageRecorder(db) });

queue.onError((error) => log.error('queue error', { error: error.message }));
await queue.start();
await registerHandlers({ db, queue, storage, llm, log }, { concurrency: env.WORKER_CONCURRENCY });

log.info('worker ready', { queues: Object.keys(jobs).length });

const shutdown = async (signal: string) => {
  log.info('shutting down', { signal });
  await queue.stop({ graceful: true });
  await close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
