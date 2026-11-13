import { opportunity } from '@job-pilot/db/schema/opportunities';
import { draft, followUp, pipelineItem } from '@job-pilot/db/schema/pipeline';
import { eventListing, jobPosting, source } from '@job-pilot/db/schema/sources';
import { todaySchema } from '@job-pilot/shared/opportunity';
import { completeFollowUpResultSchema, reviewSchema } from '@job-pilot/shared/review';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, testDatabaseUrl } from '../test/test-app.ts';

const DAY = 86_400_000;

/** Integration: follow-ups on sent applications (complete, undo, scoping, Today banners, Review data). */
describe.skipIf(!testDatabaseUrl)('follow-ups (integration)', () => {
  const t = createTestApp();
  let bob: { headers: Headers; userId: string };
  let sourceId: string;
  const tag = crypto.randomUUID();
  let n = 0;

  beforeAll(async () => {
    await t.setup();
    bob = await t.signIn();
    const [src] = await t.db
      .insert(source)
      .values({
        key: `fu-${tag}`,
        name: 'FU Board',
        kind: 'job',
        baseUrl: 'https://example.com',
        cron: '0 * * * *',
        apifyActorId: 'x/y',
      })
      .returning({ id: source.id });
    sourceId = src?.id ?? '';
  });
  afterAll(async () => {
    await t.teardown();
    const { db, close } = (await import('@job-pilot/db/client')).createDb(testDatabaseUrl ?? '', {
      max: 1,
    });
    await db.delete(jobPosting).where(eq(jobPosting.sourceId, sourceId));
    await db.delete(eventListing).where(eq(eventListing.sourceId, sourceId));
    await db.delete(source).where(eq(source.id, sourceId));
    await close();
  });

  /** A sent job with follow-up #1 due `dueInMs` from now (negative = overdue). */
  const addSent = async (userId: string, dueInMs: number) => {
    n++;
    const [p] = await t.db
      .insert(jobPosting)
      .values({
        sourceId,
        url: `https://example.com/${tag}/${n}`,
        canonicalUrl: `https://example.com/${tag}/${n}`,
        dedupeKey: `${tag}-${n}`,
        title: `Job ${n}`,
        company: `Company ${n}`,
        raw: {},
      })
      .returning({ id: jobPosting.id });
    const [opp] = await t.db
      .insert(opportunity)
      .values({ userId, type: 'job', jobPostingId: p?.id, feedStatus: 'pursued', fitScore: 80 })
      .returning({ id: opportunity.id });
    const dueAt = new Date(Date.now() + dueInMs);
    const [item] = await t.db
      .insert(pipelineItem)
      .values({
        userId,
        opportunityId: opp?.id ?? '',
        route: 'direct',
        status: 'sent',
        sentAt: new Date(Date.now() - 5 * DAY),
        nextFollowUpAt: dueAt,
      })
      .returning({ id: pipelineItem.id });
    const id = item?.id ?? '';
    const [fu] = await t.db
      .insert(followUp)
      .values({ pipelineItemId: id, sequence: 1, dueAt })
      .returning({ id: followUp.id });
    return { id, followUpId: fu?.id ?? '' };
  };

  const addEvent = async (userId: string, startsInMs: number, status = 'registered' as const) => {
    n++;
    const [e] = await t.db
      .insert(eventListing)
      .values({
        sourceId,
        url: `https://example.com/${tag}/e${n}`,
        dedupeKey: `${tag}-e${n}`,
        title: `Meetup ${n}`,
        startsAt: new Date(Date.now() + startsInMs),
        raw: {},
      })
      .returning({ id: eventListing.id });
    const [opp] = await t.db
      .insert(opportunity)
      .values({ userId, type: 'event', eventListingId: e?.id, feedStatus: 'pursued', fitScore: 80 })
      .returning({ id: opportunity.id });
    const [item] = await t.db
      .insert(pipelineItem)
      .values({ userId, opportunityId: opp?.id ?? '', route: 'event', status })
      .returning({ id: pipelineItem.id });
    return item?.id ?? '';
  };

  const req = (h: Headers, method: string, path: string, body?: unknown) =>
    t.app.request(path, {
      method,
      headers: body === undefined ? h : new Headers([...h, ['content-type', 'application/json']]),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const rows = (id: string) =>
    t.db
      .select()
      .from(followUp)
      .where(eq(followUp.pipelineItemId, id))
      .orderBy(asc(followUp.sequence));
  const item = async (id: string) =>
    (await t.db.select().from(pipelineItem).where(eq(pipelineItem.id, id)))[0];

  it('completing #1 creates #2 due in 7 days; undo restores #1 and removes #2', async () => {
    const u = await t.signIn();
    const { id, followUpId } = await addSent(u.userId, -60_000);
    const res = await req(u.headers, 'POST', `/v1/follow-ups/${followUpId}/done`);
    expect(res.status).toBe(200);
    const body = completeFollowUpResultSchema.parse(await res.json());
    const next = new Date(body.nextFollowUpAt ?? '').getTime();
    expect(Math.abs(next - (Date.now() + 7 * DAY))).toBeLessThan(10_000);

    const after = await rows(id);
    expect(after.map((f) => [f.sequence, f.status])).toEqual([
      [1, 'done'],
      [2, 'pending'],
    ]);
    expect((await item(id))?.nextFollowUpAt?.getTime()).toBe(next);
    // Not pending any more → no second completion.
    expect((await req(u.headers, 'POST', `/v1/follow-ups/${followUpId}/done`)).status).toBe(409);

    expect((await req(u.headers, 'POST', '/v1/undo', { undoToken: body.undoToken })).status).toBe(
      200,
    );
    const undone = await rows(id);
    expect(undone.map((f) => [f.sequence, f.status])).toEqual([[1, 'pending']]);
    expect(undone[0]?.completedAt).toBeNull();
    expect((await item(id))?.nextFollowUpAt).not.toBeNull();

    const again = await req(u.headers, 'POST', `/v1/follow-ups/${followUpId}/done`);
    expect(again.status).toBe(200);
    expect((await rows(id)).map((f) => f.sequence)).toEqual([1, 2]);
  });

  it('completing #2 leaves nothing pending', async () => {
    const u = await t.signIn();
    const { id, followUpId } = await addSent(u.userId, -60_000);
    await req(u.headers, 'POST', `/v1/follow-ups/${followUpId}/done`);
    const second = (await rows(id))[1];
    const res = await req(u.headers, 'POST', `/v1/follow-ups/${second?.id}/done`);
    expect(completeFollowUpResultSchema.parse(await res.json()).nextFollowUpAt).toBeNull();
    expect((await rows(id)).map((f) => f.status)).toEqual(['done', 'done']);
    expect((await item(id))?.nextFollowUpAt).toBeNull();
  });

  it('refuses another user and an item that is no longer sent', async () => {
    const u = await t.signIn();
    const { id, followUpId } = await addSent(u.userId, -60_000);
    expect((await req(bob.headers, 'POST', `/v1/follow-ups/${followUpId}/done`)).status).toBe(404);
    await t.db.update(pipelineItem).set({ status: 'replied' }).where(eq(pipelineItem.id, id));
    expect((await req(u.headers, 'POST', `/v1/follow-ups/${followUpId}/done`)).status).toBe(409);
  });

  it('Today counts due follow-ups and events within 24 h, own data only', async () => {
    const u = await t.signIn();
    const due = await addSent(u.userId, -3 * 3_600_000);
    await addSent(u.userId, -60_000);
    await addSent(u.userId, 2 * DAY); // not due yet
    await addSent(bob.userId, -60_000);
    const soon = await addEvent(u.userId, 5 * 3_600_000);
    await addEvent(u.userId, 3 * DAY);
    await addEvent(u.userId, 2 * 3_600_000, 'ready_to_send' as never);

    const res = await req(u.headers, 'GET', '/v1/today');
    expect(res.status).toBe(200);
    const body = todaySchema.parse(await res.json());
    expect(body.followUpsDue).toEqual({ count: 2, firstPipelineItemId: due.id });
    expect(body.eventsTomorrow.map((e) => e.pipelineItemId)).toEqual([soon]);
  });

  it('Review lists follow-ups with their drafts, kept out of the pack drafts', async () => {
    const u = await t.signIn();
    const { id, followUpId } = await addSent(u.userId, -60_000);
    const [d] = await t.db
      .insert(draft)
      .values({ pipelineItemId: id, kind: 'follow_up', label: 'Follow-up #1', body: 'Hello again' })
      .returning({ id: draft.id });
    await t.db.update(followUp).set({ draftId: d?.id }).where(eq(followUp.id, followUpId));
    const res = await req(u.headers, 'GET', `/v1/pipeline/${id}/review`);
    expect(res.status).toBe(200);
    const body = reviewSchema.parse(await res.json());
    expect(body.drafts).toEqual([]);
    expect(body.followUps).toHaveLength(1);
    expect(body.followUps[0]).toMatchObject({
      id: followUpId,
      sequence: 1,
      status: 'pending',
      draft: { body: 'Hello again', kind: 'follow_up' },
    });
  });
});
