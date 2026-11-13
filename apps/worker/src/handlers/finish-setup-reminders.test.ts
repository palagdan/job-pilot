import { randomUUID } from 'node:crypto';
import { createDb } from '@job-pilot/db/client';
import { user } from '@job-pilot/db/schema/auth';
import { emailLog } from '@job-pilot/db/schema/notifications';
import { like } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { finishSetupReminders } from './finish-setup-reminders.ts';

const url = process.env.TEST_DATABASE_URL;
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never;
const HOUR = 3_600_000;

describe.skipIf(!url)('finishSetupReminders', () => {
  const { db, close } = createDb(url ?? 'postgres://x', { max: 2 });
  const send = vi.fn();
  const handler = finishSetupReminders({ db, queue: { send }, log });
  const tag = randomUUID();

  const add = async (
    name: string,
    hoursAgo: number,
    extra: Partial<typeof user.$inferInsert> = {},
  ) => {
    const [row] = await db
      .insert(user)
      .values({
        name,
        email: `${name}-${tag}@example.com`,
        createdAt: new Date(Date.now() - hoursAgo * HOUR),
        ...extra,
      })
      .returning({ id: user.id });
    return (row as { id: string }).id;
  };

  beforeEach(async () => {
    send.mockReset();
    await db.delete(user).where(like(user.email, `%-${tag}@example.com`));
  });
  afterAll(async () => {
    await db.delete(user).where(like(user.email, `%-${tag}@example.com`));
    await close();
  });

  const mine = (id: string) =>
    send.mock.calls.filter(([, payload]) => (payload as { userId: string }).userId === id);

  it('enqueues exactly one reminder for a 25 h old unfinished user', async () => {
    const id = await add('due', 25);
    await add('fresh', 2);
    await add('old', 24 * 8);
    await add('done', 30, { onboardingCompletedAt: new Date() });
    await add('unsub', 30, { emailUnsubscribedAt: new Date() });
    await handler({ id: 'j', data: {} });
    expect(mine(id)).toEqual([
      [
        'email.send',
        {
          template: 'finish_setup_reminder',
          userId: id,
          dedupeKey: `finish_setup_reminder:${id}`,
          data: {},
        },
      ],
    ]);
    const ours = await db
      .select({ id: user.id })
      .from(user)
      .where(like(user.email, `%-${tag}@example.com`));
    const enqueuedOurs = send.mock.calls.filter(([, p]) =>
      ours.some((u) => u.id === (p as { userId: string }).userId),
    );
    expect(enqueuedOurs).toHaveLength(1);
  });

  it('skips users who already have a reminder logged', async () => {
    const id = await add('logged', 25);
    await db.insert(emailLog).values({
      userId: id,
      template: 'finish_setup_reminder',
      dedupeKey: `finish_setup_reminder:${id}`,
      status: 'sent',
    });
    await handler({ id: 'j', data: {} });
    expect(mine(id)).toHaveLength(0);
  });
});
