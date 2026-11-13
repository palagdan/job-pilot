import { pushSubscription } from '@job-pilot/db/schema/notifications';
import { vapidKeySchema } from '@job-pilot/shared/push';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, testDatabaseUrl } from '../test/test-app.ts';

/** Integration: Web Push key + subscriptions. */
describe.skipIf(!testDatabaseUrl)('push (integration)', () => {
  const t = createTestApp();
  let alice: { headers: Headers; userId: string };
  let bob: { headers: Headers; userId: string };
  const endpoint = `https://push.example/${crypto.randomUUID()}`;
  const body = (e = endpoint) => ({ endpoint: e, keys: { p256dh: 'BPk', auth: 'auth1' } });

  beforeAll(async () => {
    await t.setup();
    alice = await t.signIn();
    bob = await t.signIn();
  });
  afterAll(() => t.teardown());

  const req = (h: Headers, method: string, path: string, json?: unknown) =>
    t.app.request(path, {
      method,
      headers:
        json === undefined
          ? h
          : new Headers([
              ...h,
              ['content-type', 'application/json'],
              ['user-agent', 'TestBrowser/1'],
            ]),
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  const rows = (e = endpoint) =>
    t.db.select().from(pushSubscription).where(eq(pushSubscription.endpoint, e));

  it('returns the VAPID public key', async () => {
    const res = await req(alice.headers, 'GET', '/v1/push/vapid-key');
    expect(vapidKeySchema.parse(await res.json())).toEqual({ publicKey: 'test-vapid-public-key' });
  });

  it('subscribes idempotently, revives a dead row, moves the browser to the signed-in user', async () => {
    expect((await req(alice.headers, 'POST', '/v1/push/subscriptions', body())).status).toBe(200);
    expect((await req(alice.headers, 'POST', '/v1/push/subscriptions', body())).status).toBe(200);
    let [row] = await rows();
    expect(row).toMatchObject({ userId: alice.userId, userAgent: 'TestBrowser/1', failedAt: null });
    expect(await rows()).toHaveLength(1);

    await t.db
      .update(pushSubscription)
      .set({ failedAt: new Date() })
      .where(eq(pushSubscription.endpoint, endpoint));
    await req(bob.headers, 'POST', '/v1/push/subscriptions', body());
    [row] = await rows();
    expect(row).toMatchObject({ userId: bob.userId, failedAt: null });
  });

  it('keeps at most 10 live subscriptions per user', async () => {
    for (let i = 0; i < 11; i++) {
      await req(alice.headers, 'POST', '/v1/push/subscriptions', body(`${endpoint}/d${i}`));
    }
    const all = await t.db
      .select()
      .from(pushSubscription)
      .where(eq(pushSubscription.userId, alice.userId));
    expect(all).toHaveLength(10);
    expect(all.some((r) => r.endpoint.endsWith('/d0'))).toBe(false);
  });

  it("unsubscribes only the caller's own row; validates input", async () => {
    await req(alice.headers, 'DELETE', '/v1/push/subscriptions', { endpoint });
    expect(await rows()).toHaveLength(1); // bob's, untouched
    await req(bob.headers, 'DELETE', '/v1/push/subscriptions', { endpoint });
    expect(await rows()).toHaveLength(0);
    expect(
      (await req(bob.headers, 'POST', '/v1/push/subscriptions', { endpoint: 'nope' })).status,
    ).toBe(400);
  });
});
