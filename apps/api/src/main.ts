import { serve } from '@hono/node-server';
import { createDb } from '@job-pilot/db/client';
import { createLogger } from '@job-pilot/logger/logger';
import { createFileStorageFromEnv } from '@job-pilot/storage/from-env';
import { createApp } from './app.ts';
import { env } from './env.ts';
import { authBasePath } from './http/paths.ts';
import {
  createAuth,
  createDevSessionIssuer,
  createSessionReader,
} from './infrastructure/auth/better-auth.ts';
import { createPgBossJobQueue } from './infrastructure/queue/pg-boss-job-queue.ts';
import { createMemoryRateLimitStore } from './infrastructure/rate-limit/memory-rate-limit-store.ts';
import { createCvRenderer } from './infrastructure/rendering/cv-render-adapter.ts';
import { createDrizzleAgentRepository } from './infrastructure/repositories/drizzle-agent-repository.ts';
import { createDrizzleAgentRunRepository } from './infrastructure/repositories/drizzle-agent-run-repository.ts';
import { createDrizzleCvFactsReader } from './infrastructure/repositories/drizzle-cv-facts-reader.ts';
import { createDrizzleCvFileRepository } from './infrastructure/repositories/drizzle-cv-file-repository.ts';
import { createDrizzleCvRepository } from './infrastructure/repositories/drizzle-cv-repository.ts';
import { createDrizzleEmailPreferencesRepository } from './infrastructure/repositories/drizzle-email-preferences-repository.ts';
import { createDrizzleOpsReader } from './infrastructure/repositories/drizzle-ops-reader.ts';
import { createDrizzlePipelineRepository } from './infrastructure/repositories/drizzle-pipeline-repository.ts';
import { createDrizzleProfileRepository } from './infrastructure/repositories/drizzle-profile-repository.ts';
import { createDrizzlePushSubscriptionRepository } from './infrastructure/repositories/drizzle-push-subscription-repository.ts';
import { createDrizzleReviewRepository } from './infrastructure/repositories/drizzle-review-repository.ts';
import { createDrizzleScheduleRepository } from './infrastructure/repositories/drizzle-schedule-repository.ts';
import { createDrizzleTargetsRepository } from './infrastructure/repositories/drizzle-targets-repository.ts';
import { createDrizzleTodayRepository } from './infrastructure/repositories/drizzle-today-repository.ts';
import { createDrizzleUploadRepository } from './infrastructure/repositories/drizzle-upload-repository.ts';
import { createDrizzleUserRepository } from './infrastructure/repositories/drizzle-user-repository.ts';

// Composition root: the only place that knows concrete adapters.
const log = createLogger({ name: 'api', level: env.LOG_LEVEL });
const { db, close } = createDb(env.DATABASE_URL);
const jobs = createPgBossJobQueue(env.DATABASE_URL);
await jobs.start();
const auth = createAuth({
  db,
  env,
  basePath: authBasePath,
  onUserCreated: async ({ id }) => {
    try {
      await jobs.enqueueWelcomeEmail(id);
    } catch (error) {
      log.error('welcome email enqueue failed', { userId: id, error: String(error) });
    }
  },
});

const app = createApp({
  log,
  rateLimitStore: createMemoryRateLimitStore(),
  authHandler: auth.handler,
  sessions: createSessionReader(auth),
  users: createDrizzleUserRepository(db),
  uploads: createDrizzleUploadRepository(db),
  profiles: createDrizzleProfileRepository(db),
  targets: createDrizzleTargetsRepository(db),
  schedules: createDrizzleScheduleRepository(db),
  cvFacts: createDrizzleCvFactsReader(db),
  cvs: createDrizzleCvRepository(db),
  agent: createDrizzleAgentRepository(db),
  pipeline: createDrizzlePipelineRepository(db),
  ops: createDrizzleOpsReader(db),
  admins: env.ADMIN_EMAILS,
  pushSubscriptions: createDrizzlePushSubscriptionRepository(db),
  vapidPublicKey: env.VAPID_PUBLIC_KEY,
  cvFiles: createDrizzleCvFileRepository(db),
  renderer: createCvRenderer(),
  storage: createFileStorageFromEnv(env),
  jobs,
  agentJobs: jobs,
  today: createDrizzleTodayRepository(db),
  review: createDrizzleReviewRepository(db),
  agentRuns: createDrizzleAgentRunRepository(db),
  email: {
    preferences: createDrizzleEmailPreferencesRepository(db),
    secret: env.BETTER_AUTH_SECRET,
  },
  // Development only: POST /api/dev/sign-in signs in the seeded demo user without Google.
  ...(env.NODE_ENV === 'development'
    ? { devSessions: createDevSessionIssuer({ db, env, basePath: authBasePath }) }
    : {}),
});

if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
  log.warn('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Google sign-in is disabled');
}

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info('api listening', { url: `http://localhost:${info.port}` });
});

const shutdown = () => {
  server.close(async () => {
    await jobs.stop();
    await close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
