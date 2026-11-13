import { randomUUID } from 'node:crypto';
import { createDb } from '@job-pilot/db/client';
import { activity } from '@job-pilot/db/schema/activity';
import { user } from '@job-pilot/db/schema/auth';
import { opportunity } from '@job-pilot/db/schema/opportunities';
import { draft, followUp, pipelineItem } from '@job-pilot/db/schema/pipeline';
import { profile } from '@job-pilot/db/schema/profile';
import { eventListing, jobPosting, source } from '@job-pilot/db/schema/sources';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkFollowUps } from './check-follow-ups.ts';

const url = process.env.TEST_DATABASE_URL;
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never;
const DAY = 86_400_000;

describe.skipIf(!url)('checkFollowUps', () => {
  const { db, close } = createDb(url ?? 'postgres://x', { max: 2 });
  const generateObject = vi.fn();
  const generateText = vi.fn();
  const now = new Date();
  const handler = checkFollowUps({
    db,
    llm: { generateObject, generateText } as never,
    log,
    now: () => now,
  });
  const run = () => handler({ id: 'j', data: {} });
  const userIds: string[] = [];

  const newUser = async (withProfile = true) => {
    const [u] = await db
      .insert(user)
      .values({ name: 'Jan Novak', email: `jan-${randomUUID()}@example.com` })
      .returning({ id: user.id });
    const userId = (u as { id: string }).id;
    userIds.push(userId);
    if (withProfile) await db.insert(profile).values({ userId, fullName: 'Jan Novak' });
    return userId;
  };
  const srcId = async () => {
    const [s] = await db.select().from(source).limit(1);
    if (!s) throw new Error('No source row in the test DB');
    return s.id;
  };

  const addJob = async (
    userId: string,
    o: { status?: 'sent' | 'replied'; dueAt: Date; seq?: 1 | 2; done?: Date },
  ) => {
    const [j] = await db
      .insert(jobPosting)
      .values({
        sourceId: await srcId(),
        url: `https://x/${randomUUID()}`,
        canonicalUrl: `https://x/${randomUUID()}`,
        dedupeKey: randomUUID(),
        title: 'Head of Brand',
        company: 'Acme',
        description: 'Hledáme šéfa značky.',
        language: 'cs',
        raw: {},
      })
      .returning({ id: jobPosting.id });
    const [opp] = await db
      .insert(opportunity)
      .values({ userId, type: 'job', jobPostingId: (j as { id: string }).id, route: 'direct' })
      .returning({ id: opportunity.id });
    const [item] = await db
      .insert(pipelineItem)
      .values({
        userId,
        opportunityId: (opp as { id: string }).id,
        route: 'direct',
        status: o.status ?? 'sent',
        sentAt: new Date(now.getTime() - 12 * DAY),
        nextFollowUpAt: o.dueAt,
      })
      .returning({ id: pipelineItem.id });
    const id = (item as { id: string }).id;
    if (o.done) {
      await db.insert(followUp).values({
        pipelineItemId: id,
        sequence: 1,
        dueAt: new Date(o.done.getTime() - 7 * DAY),
        status: 'done',
        completedAt: new Date(o.done.getTime() - 7 * DAY),
      });
    }
    await db.insert(followUp).values({
      pipelineItemId: id,
      sequence: o.seq ?? 1,
      dueAt: o.dueAt,
      ...(o.done ? { status: 'done' as const, completedAt: o.done } : {}),
    });
    return id;
  };

  const addEvent = async (userId: string, startsInMs: number) => {
    const [e] = await db
      .insert(eventListing)
      .values({
        sourceId: await srcId(),
        url: `https://x/${randomUUID()}`,
        dedupeKey: randomUUID(),
        title: 'Brand meetup',
        startsAt: new Date(now.getTime() + startsInMs),
        raw: {},
      })
      .returning({ id: eventListing.id });
    const [opp] = await db
      .insert(opportunity)
      .values({
        userId,
        type: 'event',
        eventListingId: (e as { id: string }).id,
        route: 'event',
      })
      .returning({ id: opportunity.id });
    const [item] = await db
      .insert(pipelineItem)
      .values({
        userId,
        opportunityId: (opp as { id: string }).id,
        route: 'event',
        status: 'registered',
      })
      .returning({ id: pipelineItem.id });
    return (item as { id: string }).id;
  };

  const drafts = (id: string) =>
    db.select().from(draft).where(eq(draft.pipelineItemId, id)).orderBy(asc(draft.position));
  const fus = (id: string) =>
    db
      .select()
      .from(followUp)
      .where(eq(followUp.pipelineItemId, id))
      .orderBy(asc(followUp.sequence));
  const item = async (id: string) =>
    (await db.select().from(pipelineItem).where(eq(pipelineItem.id, id)))[0];

  beforeEach(async () => {
    generateObject.mockReset();
    generateText.mockReset();
    generateText.mockResolvedValue({ text: ' Dobry den, pripominam se. ' });
    generateObject.mockResolvedValue({
      object: { registrationSteps: ['a', 'b'], prepNotes: 'Talking points:\n- x' },
    });
    for (const id of userIds.splice(0)) await db.delete(user).where(eq(user.id, id));
  });
  afterAll(async () => {
    for (const id of userIds) await db.delete(user).where(eq(user.id, id));
    await close();
  });

  it('drafts a due follow-up once and keeps nextFollowUpAt', async () => {
    const u = await newUser();
    const dueAt = new Date(now.getTime() - 60_000);
    const id = await addJob(u, { dueAt });
    await run();
    await run();
    expect(generateText).toHaveBeenCalledTimes(1);
    const rows = await drafts(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'follow_up',
      label: 'Follow-up #1',
      body: 'Dobry den, pripominam se.',
    });
    const [f] = await fus(id);
    expect(f?.draftId).toBe(rows[0]?.id);
    expect((await item(id))?.nextFollowUpAt?.getTime()).toBe(dueAt.getTime());
    const prompt = JSON.stringify(generateText.mock.calls[0]);
    expect(prompt).toContain('Jan Novak');
    expect(prompt).toContain('Language: cs');
  });

  it('ignores follow-ups that are not due or whose item is no longer sent', async () => {
    const u = await newUser();
    const future = await addJob(u, { dueAt: new Date(now.getTime() + DAY) });
    const replied = await addJob(u, { status: 'replied', dueAt: new Date(now.getTime() - 60_000) });
    await run();
    expect(generateText).not.toHaveBeenCalled();
    expect(await drafts(future)).toHaveLength(0);
    expect(await drafts(replied)).toHaveLength(0);
  });

  it('marks no_reply 7 days after follow-up #2 was sent, and cancels the rest', async () => {
    const u = await newUser();
    const stale = await addJob(u, {
      seq: 2,
      dueAt: new Date(now.getTime() - 8 * DAY),
      done: new Date(now.getTime() - 7 * DAY - 60_000),
    });
    const fresh = await addJob(u, {
      seq: 2,
      dueAt: new Date(now.getTime() - 3 * DAY),
      done: new Date(now.getTime() - 3 * DAY),
    });
    await run();
    expect(await item(stale)).toMatchObject({ status: 'no_reply', nextFollowUpAt: null });
    expect((await item(fresh))?.status).toBe('sent');
    const acts = await db
      .select()
      .from(activity)
      .where(and(eq(activity.entityId, stale), eq(activity.action, 'pipeline.no_reply')));
    expect(acts).toHaveLength(1);
    await run();
    expect(await db.select().from(activity).where(eq(activity.entityId, stale))).toHaveLength(1);
  });

  it('ensures prep notes for a registered event starting within 24 h', async () => {
    const u = await newUser();
    const soon = await addEvent(u, 5 * 3_600_000);
    const later = await addEvent(u, 3 * DAY);
    await run();
    await run();
    expect(generateObject).toHaveBeenCalledTimes(1);
    expect((await drafts(soon)).map((d) => [d.kind, d.label])).toEqual([
      ['event_prep', 'Prep notes'],
    ]);
    expect(await drafts(later)).toHaveLength(0);
  });

  it('keeps existing prep notes untouched', async () => {
    const u = await newUser();
    const id = await addEvent(u, 5 * 3_600_000);
    await db
      .insert(draft)
      .values({ pipelineItemId: id, kind: 'event_prep', label: 'Prep notes', body: 'mine' });
    await run();
    expect(generateObject).not.toHaveBeenCalled();
    expect((await drafts(id))[0]?.body).toBe('mine');
  });

  it('isolates errors per item', async () => {
    const broken = await newUser(false); // no profile → throws
    const ok = await newUser();
    const a = await addJob(broken, { dueAt: new Date(now.getTime() - 120_000) });
    const b = await addJob(ok, { dueAt: new Date(now.getTime() - 60_000) });
    await run();
    expect(await drafts(a)).toHaveLength(0);
    expect(await drafts(b)).toHaveLength(1);
  });

  it('isolates LLM failures and retries on the next run', async () => {
    const u = await newUser();
    const id = await addJob(u, { dueAt: new Date(now.getTime() - 60_000) });
    generateText.mockRejectedValueOnce(new Error('boom'));
    await run();
    expect(await drafts(id)).toHaveLength(0);
    await run();
    expect(await drafts(id)).toHaveLength(1);
  });
});
