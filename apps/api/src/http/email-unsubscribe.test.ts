import { createDb } from '@job-pilot/db/client';
import { runMigrations } from '@job-pilot/db/migrator';
import { user } from '@job-pilot/db/schema/auth';
import { schedule } from '@job-pilot/db/schema/profile';
import { createUnsubscribeToken } from '@job-pilot/emails/unsubscribe-token';
import { silentLogger } from '@job-pilot/logger/logger';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createMemoryRateLimitStore } from '../infrastructure/rate-limit/memory-rate-limit-store.ts';
import { createDrizzleEmailPreferencesRepository } from '../infrastructure/repositories/drizzle-email-preferences-repository.ts';

/** Integration: real Postgres; public route, so no auth instance is needed. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('email unsubscribe (integration)', () => {
  const { db, close } = createDb(url ?? 'postgres://unused', { max: 2 });
  const secret = 'test-secret-test-secret-test-secret-123';
  const email = `unsub-${Date.now()}@example.com`;
  let userId: string;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    await runMigrations(url as string);
    const [row] = await db
      .insert(user)
      .values({ name: 'Unsub Test', email })
      .returning({ id: user.id });
    userId = (row as { id: string }).id;
    app = createApp({
      log: silentLogger,
      rateLimitStore: createMemoryRateLimitStore(),
      authHandler: async () => new Response(null, { status: 404 }),
      sessions: { read: async () => null },
      // Only the unsubscribe route is exercised; the other deps are never called.
      users: {} as never,
      uploads: {} as never,
      profiles: {} as never,
      targets: {} as never,
      schedules: {} as never,
      storage: {} as never,
      jobs: {} as never,
      email: { preferences: createDrizzleEmailPreferencesRepository(db), secret },
    });
  });

  afterAll(async () => {
    await db.delete(user).where(eq(user.email, email));
    await close();
  });

  const notifyEmail = async () =>
    (await db.select().from(schedule).where(eq(schedule.userId, userId)))[0]?.notifyEmail;

  it('rejects a bad token with 400 and changes nothing', async () => {
    const res = await app.request('/v1/email/unsubscribe?token=nope', { method: 'POST' });
    expect(res.status).toBe(400);
    const forged = createUnsubscribeToken(userId, 'another-secret-another-secret-12345');
    expect(
      (await app.request(`/v1/email/unsubscribe?token=${forged}`, { method: 'POST' })).status,
    ).toBe(400);
    expect((await app.request('/v1/email/unsubscribe', { method: 'POST' })).status).toBe(400);
    expect(await notifyEmail()).toBeUndefined();
  });

  it('one-click POST turns notifyEmail off (creating the schedule row) without a session', async () => {
    const token = createUnsubscribeToken(userId, secret);
    const res = await app.request(`/v1/email/unsubscribe?token=${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await notifyEmail()).toBe(false);
    const [row] = await db.select().from(user).where(eq(user.id, userId));
    expect(row?.emailUnsubscribedAt).toBeInstanceOf(Date);
  });

  it('GET from the footer link shows the page, and is idempotent', async () => {
    const token = createUnsubscribeToken(userId, secret);
    const res = await app.request(`/v1/email/unsubscribe?token=${token}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain("You're unsubscribed");
    expect(await notifyEmail()).toBe(false);
    expect((await app.request('/v1/email/unsubscribe?token=bad')).status).toBe(400);
  });
});
