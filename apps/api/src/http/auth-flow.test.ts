import { createDb } from '@job-pilot/db/client';
import { runMigrations } from '@job-pilot/db/migrator';
import { user } from '@job-pilot/db/schema/auth';
import { silentLogger } from '@job-pilot/logger/logger';
import { meSchema } from '@job-pilot/shared/user';
import { betterAuth } from 'better-auth';
import { testUtils } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import {
  createAuthOptions,
  createDevSessionIssuer,
  createSessionReader,
} from '../infrastructure/auth/better-auth.ts';
import { createMemoryRateLimitStore } from '../infrastructure/rate-limit/memory-rate-limit-store.ts';
import { createDrizzleUserRepository } from '../infrastructure/repositories/drizzle-user-repository.ts';
import { authBasePath } from './paths.ts';

/**
 * Integration: real Better Auth + Postgres. Sessions are created with Better Auth's `testUtils` plugin
 * (no Google round-trip), so the signed cookie → requireUser → /v1/me path is the production code path.
 * Runs only when TEST_DATABASE_URL is set (docker `jobpilot_test`).
 */
const url = process.env.TEST_DATABASE_URL;
const email = `auth-flow-${Date.now()}@example.com`;

describe.skipIf(!url)('auth flow (integration)', () => {
  const { db, close } = createDb(url ?? 'postgres://unused', { max: 2 });
  const env = {
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
    WEB_URL: 'http://localhost:3000',
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
  };
  const auth = betterAuth({
    ...createAuthOptions({ db, env, basePath: authBasePath }),
    plugins: [testUtils()],
  });
  const app = createApp({
    log: silentLogger,
    rateLimitStore: createMemoryRateLimitStore(),
    authHandler: auth.handler,
    sessions: createSessionReader(auth),
    users: createDrizzleUserRepository(db),
    devSessions: createDevSessionIssuer({ db, env, basePath: authBasePath }),
  });
  let headers: Headers;
  let userId: string;

  beforeAll(async () => {
    await runMigrations(url as string);
    const test = (await auth.$context).test;
    const saved = await test.saveUser(test.createUser({ email, name: 'Flow Test' }));
    userId = saved.id;
    headers = (await test.login({ userId })).headers;
  });

  afterAll(async () => {
    await db.delete(user).where(eq(user.email, email));
    await close();
  });

  it('creates users with uuid ids and our column defaults', async () => {
    expect(userId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('GET /v1/me returns the signed-in user', async () => {
    const res = await app.request('/v1/me', { headers });
    expect(res.status).toBe(200);
    const me = meSchema.parse(await res.json());
    expect(me).toMatchObject({
      id: userId,
      email,
      theme: 'system',
      onboardingStep: 'upload',
      pausedAt: null,
    });
  });

  it('GET /v1/me without a cookie is 401', async () => {
    const res = await app.request('/v1/me');
    expect(res.status).toBe(401);
  });

  it('GET /v1/me with a tampered cookie is 401', async () => {
    const tampered = new Headers({ cookie: (headers.get('cookie') ?? '').replace(/=(.)/, '=x$1') });
    const res = await app.request('/v1/me', { headers: tampered });
    expect(res.status).toBe(401);
  });

  it('serves Better Auth routes under /api/auth', async () => {
    const res = await app.request(`${authBasePath}/get-session`, { headers });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { email: string } };
    expect(body.user.email).toBe(email);
  });

  it('lists no social providers when Google is not configured', async () => {
    const res = await app.request(`${authBasePath}/sign-in/social`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: env.WEB_URL },
      body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('dev sign-in issues a working session cookie for an existing user', async () => {
    const res = await app.request('/api/dev/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    expect(res.status).toBe(200);
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    const me = await app.request('/v1/me', { headers: { cookie } });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { email: string }).email).toBe(email);
  });

  it('dev sign-in for an unknown email is 404', async () => {
    const res = await app.request('/api/dev/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com' }),
    });
    expect(res.status).toBe(404);
  });

  it('dev routes do not exist when devSessions is not provided', async () => {
    const prodLike = createApp({
      log: silentLogger,
      rateLimitStore: createMemoryRateLimitStore(),
      authHandler: auth.handler,
      sessions: createSessionReader(auth),
      users: createDrizzleUserRepository(db),
    });
    const res = await prodLike.request('/api/dev/sign-in', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});
