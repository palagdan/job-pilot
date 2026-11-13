import { meSchema } from '@job-pilot/shared/user';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, testDatabaseUrl } from '../test/test-app.ts';
import { authBasePath } from './paths.ts';

/**
 * Integration: real Better Auth + Postgres. Sessions come from Better Auth's `testUtils` (no Google round-trip),
 * so the signed cookie → requireUser → /v1/me path is the production code path.
 */
describe.skipIf(!testDatabaseUrl)('auth flow (integration)', () => {
  const t = createTestApp();
  let headers: Headers;
  let userId: string;
  let email: string;

  beforeAll(async () => {
    await t.setup();
    ({ headers, userId, email } = await t.signIn({ name: 'Flow Test' }));
  });
  afterAll(() => t.teardown());

  it('creates users with uuid ids and our column defaults', () => {
    expect(userId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('GET /v1/me returns the signed-in user', async () => {
    const res = await t.app.request('/v1/me', { headers });
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
    expect((await t.app.request('/v1/me')).status).toBe(401);
  });

  it('GET /v1/me with a tampered cookie is 401', async () => {
    const tampered = new Headers({ cookie: (headers.get('cookie') ?? '').replace(/=(.)/, '=x$1') });
    expect((await t.app.request('/v1/me', { headers: tampered })).status).toBe(401);
  });

  it('serves Better Auth routes under /api/auth', async () => {
    const res = await t.app.request(`${authBasePath}/get-session`, { headers });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { email: string } }).user.email).toBe(email);
  });

  it('Google sign-in is unavailable when not configured', async () => {
    const res = await t.app.request(`${authBasePath}/sign-in/social`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('dev sign-in issues a working session cookie for an existing user', async () => {
    const res = await t.app.request('/api/dev/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    expect(res.status).toBe(200);
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    const me = await t.app.request('/v1/me', { headers: { cookie } });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { email: string }).email).toBe(email);
  });

  it('dev sign-in for an unknown email is 404', async () => {
    const res = await t.app.request('/api/dev/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com' }),
    });
    expect(res.status).toBe(404);
  });

  it('dev routes do not exist when devSessions is not provided', async () => {
    const res = await t
      .build({ devSessions: undefined })
      .request('/api/dev/sign-in', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});
