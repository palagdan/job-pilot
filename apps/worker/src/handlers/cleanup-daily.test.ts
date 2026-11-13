import { randomUUID } from 'node:crypto';
import { createDb } from '@job-pilot/db/client';
import { session, user, verification } from '@job-pilot/db/schema/auth';
import { pushSubscription } from '@job-pilot/db/schema/notifications';
import { eq, like } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { cleanupDaily } from './cleanup-daily.ts';

const url = process.env.TEST_DATABASE_URL;
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never;
const DAY = 86_400_000;

describe.skipIf(!url)('cleanupDaily', () => {
  const { db, close } = createDb(url ?? 'postgres://x', { max: 2 });
  const now = new Date('2026-11-13T03:30:00Z');
  const tag = randomUUID().slice(0, 8);
  let userId = '';

  afterAll(async () => {
    if (userId) await db.delete(user).where(eq(user.id, userId));
    await db.delete(verification).where(like(verification.identifier, `${tag}-%`));
    await close();
  });

  it('removes expired sessions and tokens and long-dead push subscriptions only', async () => {
    const [u] = await db
      .insert(user)
      .values({ name: 'Cleanup', email: `cleanup-${tag}@example.com` })
      .returning({ id: user.id });
    userId = u?.id ?? '';
    const ago = (days: number) => new Date(now.getTime() - days * DAY);
    await db.insert(session).values([
      { userId, token: `${tag}-old`, expiresAt: ago(1) },
      { userId, token: `${tag}-live`, expiresAt: ago(-1) },
    ]);
    await db.insert(verification).values([
      { identifier: `${tag}-old`, value: 'x', expiresAt: ago(1) },
      { identifier: `${tag}-live`, value: 'x', expiresAt: ago(-1) },
    ]);
    const sub = (name: string, failedAt: Date | null) => ({
      userId,
      endpoint: `https://push.example/${tag}/${name}`,
      p256dh: 'p',
      auth: 'a',
      failedAt,
    });
    await db
      .insert(pushSubscription)
      .values([sub('dead', ago(8)), sub('just-dead', ago(2)), sub('live', null)]);

    await cleanupDaily({ db, log, now: () => now })({ id: 'j', data: {} });

    const tokens = await db
      .select({ t: session.token })
      .from(session)
      .where(eq(session.userId, userId));
    expect(tokens.map((r) => r.t)).toEqual([`${tag}-live`]);
    const ids = await db
      .select({ i: verification.identifier })
      .from(verification)
      .where(like(verification.identifier, `${tag}-%`));
    expect(ids.map((r) => r.i)).toEqual([`${tag}-live`]);
    const subs = await db
      .select({ e: pushSubscription.endpoint })
      .from(pushSubscription)
      .where(eq(pushSubscription.userId, userId));
    expect(subs.map((r) => r.e.split('/').pop()).sort()).toEqual(['just-dead', 'live']);
  });
});
