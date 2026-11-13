import { serve } from '@hono/node-server';
import { createDb } from '@job-pilot/db/client';
import { createLogger } from '@job-pilot/logger/logger';
import { createApp } from './app.ts';
import { env } from './env.ts';
import { authBasePath } from './http/paths.ts';
import {
  createAuth,
  createDevSessionIssuer,
  createSessionReader,
} from './infrastructure/auth/better-auth.ts';
import { createMemoryRateLimitStore } from './infrastructure/rate-limit/memory-rate-limit-store.ts';
import { createDrizzleUserRepository } from './infrastructure/repositories/drizzle-user-repository.ts';

// Composition root: the only place that knows concrete adapters.
const log = createLogger({ name: 'api', level: env.LOG_LEVEL });
const { db, close } = createDb(env.DATABASE_URL);
const auth = createAuth({ db, env, basePath: authBasePath });

const app = createApp({
  log,
  rateLimitStore: createMemoryRateLimitStore(),
  authHandler: auth.handler,
  sessions: createSessionReader(auth),
  users: createDrizzleUserRepository(db),
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
    await close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
