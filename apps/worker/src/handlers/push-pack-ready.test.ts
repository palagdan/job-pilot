import { randomUUID } from 'node:crypto';
import { createDb } from '@job-pilot/db/client';
import { user } from '@job-pilot/db/schema/auth';
import { pushSubscription } from '@job-pilot/db/schema/notifications';
import { opportunity } from '@job-pilot/db/schema/opportunities';
import { pipelineItem } from '@job-pilot/db/schema/pipeline';
import { schedule } from '@job-pilot/db/schema/profile';
import { jobPosting, source } from '@job-pilot/db/schema/sources';
import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PushOutcome, PushSender } from '../push/push-sender.ts';
import { type PushMessage, pushPackReady } from './push-pack-ready.ts';

const url = process.env.TEST_DATABASE_URL;
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never;

describe.skipIf(!url)('pushPackReady', () => {
  const { db, close } = createDb(url ?? 'postgres://x', { max: 2 });
  const now = new Date('2026-11-13T08:00:00Z');
  const outcomes = new Map<string, PushOutcome>();
  const send = vi.fn<PushSender>(async (t) => outcomes.get(t.endpoint) ?? 'sent');
  const handler = pushPackReady({ db, send, webUrl: 'https://app.example', log, now: () => now });
  const tag = randomUUID().slice(0, 8);
  let userId: string;
  let sourceId: string;
  let itemId: string;

  const subscribe = (name: string) =>
    db.insert(pushSubscription).values({
      userId,
      endpoint: `https://push.example/${tag}/${name}`,
      p256dh: 'p',
      auth: 'a',
    });
  const setItem = (status: 'ready_to_send' | 'sent') =>
    db.update(pipelineItem).set({ status }).where(eq(pipelineItem.id, itemId));

  beforeAll(async () => {
    const [u] = await db
      .insert(user)
      .values({ name: 'Push Test', email: `push-${tag}@example.com` })
      .returning({ id: user.id });
    userId = (u as { id: string }).id;
    await db.insert(schedule).values({ userId, notifyPush: true });
    const [s] = await db
      .insert(source)
      .values({
        key: `test-${tag}`,
        name: 'Test',
        kind: 'job',
        baseUrl: 'https://x.example',
        apifyActorId: 'x',
        cron: '0 0 * * *',
        enabled: false,
      })
      .returning({ id: source.id });
    sourceId = (s as { id: string }).id;
    const [p] = await db
      .insert(jobPosting)
      .values({
        sourceId,
        url: `https://x.example/${tag}`,
        canonicalUrl: `https://x.example/${tag}`,
        dedupeKey: `${tag}-1`,
        title: 'Head of Growth',
        company: 'Company D',
        raw: {},
      })
      .returning({ id: jobPosting.id });
    const [o] = await db
      .insert(opportunity)
      .values({ userId, type: 'job', jobPostingId: p?.id, feedStatus: 'pursued' })
      .returning({ id: opportunity.id });
    const [i] = await db
      .insert(pipelineItem)
      .values({ userId, opportunityId: o?.id ?? '', route: 'direct', status: 'ready_to_send' })
      .returning({ id: pipelineItem.id });
    itemId = i?.id ?? '';
  });
  beforeEach(async () => {
    send.mockClear();
    outcomes.clear();
    await db.delete(pushSubscription).where(like(pushSubscription.endpoint, `%/${tag}/%`));
    await setItem('ready_to_send');
    await db.update(user).set({ pausedAt: null }).where(eq(user.id, userId));
    await db.update(schedule).set({ notifyPush: true }).where(eq(schedule.userId, userId));
  });
  afterAll(async () => {
    await db.delete(user).where(eq(user.id, userId));
    await db.delete(jobPosting).where(like(jobPosting.dedupeKey, `${tag}-%`));
    await db.delete(source).where(eq(source.id, sourceId));
    await close();
  });

  const run = () => handler({ id: 'j', data: { pipelineItemId: itemId } });

  it('pushes to every live device with a link to Review', async () => {
    await subscribe('laptop');
    await subscribe('phone');
    await run();
    expect(send).toHaveBeenCalledTimes(2);
    const message = JSON.parse(send.mock.calls[0]?.[1] ?? '{}') as PushMessage;
    expect(message).toEqual({
      title: 'A pack is ready to send',
      body: 'Head of Growth - Company D. Review it and send it yourself.',
      url: `https://app.example/review/${itemId}`,
      tag: `pack-ready:${itemId}`,
    });
  });

  it('marks gone subscriptions and skips them next time', async () => {
    await subscribe('laptop');
    await subscribe('old');
    outcomes.set(`https://push.example/${tag}/old`, 'gone');
    await run();
    const [old] = await db
      .select()
      .from(pushSubscription)
      .where(eq(pushSubscription.endpoint, `https://push.example/${tag}/old`));
    expect(old?.failedAt).toEqual(now);
    send.mockClear();
    await run();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retries only when no device was reached', async () => {
    await subscribe('laptop');
    outcomes.set(`https://push.example/${tag}/laptop`, 'failed');
    await expect(run()).rejects.toThrow('push failed');
    await subscribe('phone');
    await expect(run()).resolves.toBeUndefined(); // phone got it: no retry, no double push
  });

  it('skips when push is off, the user is paused, or the pack is no longer ready', async () => {
    await subscribe('laptop');
    await db.update(schedule).set({ notifyPush: false }).where(eq(schedule.userId, userId));
    await run();
    await db.update(schedule).set({ notifyPush: true }).where(eq(schedule.userId, userId));
    await db.update(user).set({ pausedAt: now }).where(eq(user.id, userId));
    await run();
    await db.update(user).set({ pausedAt: null }).where(eq(user.id, userId));
    await setItem('sent');
    await run();
    expect(send).not.toHaveBeenCalled();
  });

  it('does nothing when push is not configured', async () => {
    await subscribe('laptop');
    await pushPackReady({ db, send: undefined, webUrl: 'x', log })({
      id: 'j',
      data: { pipelineItemId: itemId },
    });
    expect(send).not.toHaveBeenCalled();
  });
});
