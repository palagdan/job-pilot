import { serve } from '@hono/node-server';
import { createDb } from '@job-pilot/db/client';
import { createApp } from './app.ts';
import { env } from './env.ts';
import { authBasePath } from './http/paths.ts';
import { createAuth, createSessionReader } from './infrastructure/auth/better-auth.ts';
import { createDrizzleUserRepository } from './infrastructure/repositories/drizzle-user-repository.ts';

// Composition root: the only place that knows concrete adapters.
const { db, close } = createDb(env.DATABASE_URL);
const auth = createAuth({ db, env, basePath: authBasePath });

const app = createApp({
  authHandler: auth.handler,
  sessions: createSessionReader(auth),
  users: createDrizzleUserRepository(db),
});

if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
  console.warn('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Google sign-in is disabled.');
}

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});

const shutdown = () => {
  server.close(async () => {
    await close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
