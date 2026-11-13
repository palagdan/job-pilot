import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb } from '@job-pilot/db/client';
import { runMigrations } from '@job-pilot/db/migrator';
import { user } from '@job-pilot/db/schema/auth';
import { silentLogger } from '@job-pilot/logger/logger';
import { createLocalFileStorage } from '@job-pilot/storage/local-file-storage';
import { betterAuth } from 'better-auth';
import { testUtils } from 'better-auth/plugins';
import { inArray } from 'drizzle-orm';
import { type AppDeps, createApp } from '../app.ts';
import { authBasePath } from '../http/paths.ts';
import {
  createAuthOptions,
  createDevSessionIssuer,
  createSessionReader,
} from '../infrastructure/auth/better-auth.ts';
import { createMemoryRateLimitStore } from '../infrastructure/rate-limit/memory-rate-limit-store.ts';
import { createCvRenderer } from '../infrastructure/rendering/cv-render-adapter.ts';
import { createDrizzleAgentRepository } from '../infrastructure/repositories/drizzle-agent-repository.ts';
import { createDrizzleAgentRunRepository } from '../infrastructure/repositories/drizzle-agent-run-repository.ts';
import { createDrizzleCvFactsReader } from '../infrastructure/repositories/drizzle-cv-facts-reader.ts';
import { createDrizzleCvFileRepository } from '../infrastructure/repositories/drizzle-cv-file-repository.ts';
import { createDrizzleCvRepository } from '../infrastructure/repositories/drizzle-cv-repository.ts';
import { createDrizzleOpsReader } from '../infrastructure/repositories/drizzle-ops-reader.ts';
import { createDrizzlePipelineRepository } from '../infrastructure/repositories/drizzle-pipeline-repository.ts';
import { createDrizzleProfileRepository } from '../infrastructure/repositories/drizzle-profile-repository.ts';
import { createDrizzleReviewRepository } from '../infrastructure/repositories/drizzle-review-repository.ts';
import { createDrizzleScheduleRepository } from '../infrastructure/repositories/drizzle-schedule-repository.ts';
import { createDrizzleTargetsRepository } from '../infrastructure/repositories/drizzle-targets-repository.ts';
import { createDrizzleTodayRepository } from '../infrastructure/repositories/drizzle-today-repository.ts';
import { createDrizzleUploadRepository } from '../infrastructure/repositories/drizzle-upload-repository.ts';
import { createDrizzleUserRepository } from '../infrastructure/repositories/drizzle-user-repository.ts';

export const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export const testEnv = {
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
  WEB_URL: 'http://localhost:3000',
  GOOGLE_CLIENT_ID: undefined,
  GOOGLE_CLIENT_SECRET: undefined,
};

/**
 * Full api against the test database: real repositories and Better Auth (sessions via `testUtils`),
 * local-disk storage in a temp dir, and a job queue that only records what was enqueued.
 * Call `setup()` in beforeAll and `teardown()` in afterAll; users created with `signIn` are deleted on teardown.
 */
export const createTestApp = (overrides: Partial<AppDeps> = {}) => {
  const { db, close } = createDb(testDatabaseUrl ?? 'postgres://unused', { max: 2 });
  const auth = betterAuth({
    ...createAuthOptions({ db, env: testEnv, basePath: authBasePath }),
    plugins: [testUtils()],
  });
  const jobs = {
    parse: [] as string[],
    generateMaster: [] as { userId: string; uploadId: string }[],
    agentRuns: [] as string[],
    packPrepare: [] as string[],
  };
  const emails: string[] = [];
  let dir = '';
  let app: ReturnType<typeof createApp> | undefined;

  const deps = (): AppDeps => ({
    log: silentLogger,
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
    admins: ['ops-admin@example.com'],
    cvFiles: createDrizzleCvFileRepository(db),
    renderer: createCvRenderer(),
    storage: createLocalFileStorage(dir),
    jobs: {
      enqueueCvParse: async (uploadId) => void jobs.parse.push(uploadId),
      enqueueGenerateMasterCv: async (userId, uploadId) =>
        void jobs.generateMaster.push({ userId, uploadId }),
    },
    agentJobs: {
      enqueueAgentRun: async (runId) => void jobs.agentRuns.push(runId),
      enqueuePackPrepare: async (id) => void jobs.packPrepare.push(id),
    },
    today: createDrizzleTodayRepository(db),
    review: createDrizzleReviewRepository(db),
    agentRuns: createDrizzleAgentRunRepository(db),
    devSessions: createDevSessionIssuer({ db, env: testEnv, basePath: authBasePath }),
    ...overrides,
  });

  return {
    db,
    auth,
    jobs,
    get app() {
      if (!app) throw new Error('call setup() first');
      return app;
    },
    /** Builds an app with different deps (same db/auth). */
    build: (extra: Partial<AppDeps>) => createApp({ ...deps(), ...extra }),
    setup: async () => {
      if (!testDatabaseUrl) return;
      await runMigrations(testDatabaseUrl);
      dir = await mkdtemp(join(tmpdir(), 'jp-api-test-'));
      app = createApp(deps());
    },
    /** Creates a user and returns session headers. */
    signIn: async (fields: { email?: string; name?: string } = {}) => {
      const test = (await auth.$context).test;
      const email = fields.email ?? `t-${crypto.randomUUID()}@example.com`;
      emails.push(email);
      const saved = (await test.saveUser(
        test.createUser({ email, name: fields.name ?? 'Test User' }),
      )) as { id: string };
      const { headers } = await test.login({ userId: saved.id });
      return { headers, userId: saved.id, email };
    },
    teardown: async () => {
      if (emails.length) await db.delete(user).where(inArray(user.email, emails)); // cascades
      await close();
      if (dir) await rm(dir, { recursive: true, force: true });
    },
  };
};
