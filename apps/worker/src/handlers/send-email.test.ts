import { randomUUID } from 'node:crypto';
import { createDb } from '@job-pilot/db/client';
import { user } from '@job-pilot/db/schema/auth';
import { emailLog } from '@job-pilot/db/schema/notifications';
import { schedule } from '@job-pilot/db/schema/profile';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendEmail } from './send-email.ts';

const url = process.env.TEST_DATABASE_URL;
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never;

describe.skipIf(!url)('sendEmail', () => {
  const { db, close } = createDb(url ?? 'postgres://x', { max: 2 });
  const send = vi.fn();
  const handler = sendEmail({
    db,
    sender: { send },
    log,
    webUrl: 'https://app.test',
    apiUrl: 'https://api.test',
    unsubscribeSecret: 'secret-secret-secret-secret-secret-1',
  });
  const email = `send-${randomUUID()}@example.com`;
  let userId: string;

  const run = (template: string, key = `${template}:${userId}`) =>
    handler({ id: 'j', data: { template, userId, dedupeKey: key, data: {} } });
  const logRows = () => db.select().from(emailLog).where(eq(emailLog.userId, userId));

  beforeEach(async () => {
    send.mockReset();
    send.mockResolvedValue({ providerMessageId: 'm1' });
    await db.delete(user).where(eq(user.email, email));
    [{ id: userId }] = (await db
      .insert(user)
      .values({ name: 'Ada Lovelace', email })
      .returning({ id: user.id })) as [{ id: string }];
  });
  afterAll(async () => {
    await db.delete(user).where(eq(user.email, email));
    await close();
  });

  it('sends once with List-Unsubscribe headers and logs it', async () => {
    await run('welcome');
    await run('welcome');
    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0]?.[0];
    expect(mail.to).toBe(email);
    expect(mail.headers['List-Unsubscribe']).toMatch(
      /^<https:\/\/api\.test\/v1\/email\/unsubscribe\?token=.+>$/,
    );
    expect(mail.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    const rows = await logRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'sent', providerMessageId: 'm1' });
  });

  it('marks failed and rethrows; a retry sends', async () => {
    send.mockRejectedValueOnce(new Error('boom'));
    await expect(run('welcome')).rejects.toThrow('boom');
    expect((await logRows())[0]).toMatchObject({ status: 'failed', error: 'boom' });
    await run('welcome');
    expect(send).toHaveBeenCalledTimes(2);
    expect((await logRows())[0]?.status).toBe('sent');
  });

  it('respects notifyEmail=false except for welcome', async () => {
    await db.insert(schedule).values({ userId, notifyEmail: false });
    await run('finish_setup_reminder');
    expect(send).not.toHaveBeenCalled();
    await run('welcome');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('skips a reminder once onboarding is complete and a missing user', async () => {
    await db.update(user).set({ onboardingCompletedAt: new Date() }).where(eq(user.id, userId));
    await run('finish_setup_reminder');
    await handler({
      id: 'j',
      data: { template: 'welcome', userId: randomUUID(), dedupeKey: `w:${randomUUID()}`, data: {} },
    });
    expect(send).not.toHaveBeenCalled();
  });
});
