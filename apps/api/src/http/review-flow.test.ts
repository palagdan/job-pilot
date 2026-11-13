import { activity } from '@job-pilot/db/schema/activity';
import { cv } from '@job-pilot/db/schema/cv';
import { opportunity } from '@job-pilot/db/schema/opportunities';
import { draft, followUp, pipelineItem } from '@job-pilot/db/schema/pipeline';
import { eventListing, jobPosting, source } from '@job-pilot/db/schema/sources';
import { draftSchema, markSentResultSchema } from '@job-pilot/shared/draft';
import { apiErrorSchema } from '@job-pilot/shared/errors';
import { pipelineItemSchema } from '@job-pilot/shared/pipeline';
import { reviewListSchema, reviewSchema } from '@job-pilot/shared/review';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, testDatabaseUrl } from '../test/test-app.ts';

/** Integration: real Postgres + sessions. Items are inserted directly in the state the pack job leaves them. */
describe.skipIf(!testDatabaseUrl)('review (integration)', () => {
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
        key: `review-${tag}`,
        name: 'Review Board',
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

  const addItem = async (
    userId: string,
    opts: {
      type?: 'job' | 'event';
      status?: 'ready_to_send' | 'preparing';
      expired?: boolean;
    } = {},
  ) => {
    n++;
    const type = opts.type ?? 'job';
    let oppValues: typeof opportunity.$inferInsert;
    if (type === 'job') {
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
          expiredAt: opts.expired ? new Date() : null,
        })
        .returning({ id: jobPosting.id });
      oppValues = { userId, type, jobPostingId: p?.id, feedStatus: 'pursued', fitScore: 80 };
    } else {
      const [e] = await t.db
        .insert(eventListing)
        .values({
          sourceId,
          url: `https://example.com/${tag}/e${n}`,
          dedupeKey: `${tag}-e${n}`,
          title: `Event, ${n}; with "chars"`,
          city: 'Praha',
          startsAt: new Date(Date.now() + 7 * 86_400_000),
          raw: {},
        })
        .returning({ id: eventListing.id });
      oppValues = { userId, type, eventListingId: e?.id, feedStatus: 'pursued', fitScore: 80 };
    }
    const [opp] = await t.db
      .insert(opportunity)
      .values(oppValues)
      .returning({ id: opportunity.id });
    const [item] = await t.db
      .insert(pipelineItem)
      .values({
        userId,
        opportunityId: opp?.id ?? '',
        route: type === 'job' ? 'direct' : 'event',
        status: opts.status ?? 'ready_to_send',
      })
      .returning({ id: pipelineItem.id });
    const id = item?.id ?? '';
    const [d0, d1] = await t.db
      .insert(draft)
      .values([
        {
          pipelineItemId: id,
          kind: type === 'job' ? 'cover_text' : 'event_prep',
          body: 'Dear team',
          position: 0,
        },
        {
          pipelineItemId: id,
          kind: 'form_answer',
          label: 'Why?',
          body: 'Because',
          charLimit: 20,
          position: 1,
        },
      ])
      .returning({ id: draft.id });
    let cvId: string | null = null;
    if (type === 'job') {
      const [c] = await t.db
        .insert(cv)
        .values({
          userId,
          kind: 'special',
          pipelineItemId: id,
          status: 'needs_review',
          changes: ['Headline rewritten'],
        })
        .returning({ id: cv.id });
      cvId = c?.id ?? null;
    }
    return { id, draftIds: [d0?.id ?? '', d1?.id ?? ''], cvId };
  };

  const req = (h: Headers, method: string, path: string, body?: unknown) =>
    t.app.request(path, {
      method,
      headers: body === undefined ? h : new Headers([...h, ['content-type', 'application/json']]),
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  describe('read', () => {
    it('returns the review payload with ordered drafts and the special CV', async () => {
      const u = await t.signIn();
      const { id, cvId } = await addItem(u.userId);
      const res = await req(u.headers, 'GET', `/v1/pipeline/${id}/review`);
      expect(res.status).toBe(200);
      const body = reviewSchema.parse(await res.json());
      expect(body.item).toMatchObject({ id, status: 'ready_to_send', specialCvId: cvId });
      expect(body.url).toContain(tag);
      expect(body.sourceName).toBe('Review Board');
      expect(body.postingUnavailable).toBe(false);
      expect(body.drafts.map((d) => d.kind)).toEqual(['cover_text', 'form_answer']);
      expect(body.specialCv).toMatchObject({ id: cvId, changes: ['Headline rewritten'] });
      expect(body.event).toBeNull();
    });

    it('flags an expired posting and returns event details', async () => {
      const u = await t.signIn();
      const { id } = await addItem(u.userId, { expired: true });
      expect(
        reviewSchema.parse(await (await req(u.headers, 'GET', `/v1/pipeline/${id}/review`)).json())
          .postingUnavailable,
      ).toBe(true);
      const ev = await addItem(u.userId, { type: 'event' });
      const body = reviewSchema.parse(
        await (await req(u.headers, 'GET', `/v1/pipeline/${ev.id}/review`)).json(),
      );
      expect(body.event).toMatchObject({ city: 'Praha', online: false });
      expect(body.specialCv).toBeNull();
    });

    it('serves getPipelineItem and getDrafts', async () => {
      const u = await t.signIn();
      const { id } = await addItem(u.userId);
      const item = pipelineItemSchema.parse(
        await (await req(u.headers, 'GET', `/v1/pipeline/${id}`)).json(),
      );
      expect(item.id).toBe(id);
      const drafts = (await (
        await req(u.headers, 'GET', `/v1/pipeline/${id}/drafts`)
      ).json()) as unknown[];
      expect(drafts.map((d) => draftSchema.parse(d).kind)).toEqual(['cover_text', 'form_answer']);
    });

    it('lists only own items waiting for review', async () => {
      const u = await t.signIn();
      const a = await addItem(u.userId);
      await addItem(u.userId, { status: 'preparing' });
      await addItem(bob.userId);
      const body = reviewListSchema.parse(await (await req(u.headers, 'GET', '/v1/review')).json());
      expect(body.items.map((i) => i.id)).toEqual([a.id]);
    });

    it('is scoped: 404 for other users, 401 without a session', async () => {
      const u = await t.signIn();
      const { id, draftIds } = await addItem(u.userId);
      for (const path of [
        `/v1/pipeline/${id}`,
        `/v1/pipeline/${id}/review`,
        `/v1/pipeline/${id}/drafts`,
      ]) {
        expect((await req(bob.headers, 'GET', path)).status).toBe(404);
      }
      expect(
        (await req(bob.headers, 'PUT', `/v1/drafts/${draftIds[0]}`, { body: 'x', version: 1 }))
          .status,
      ).toBe(404);
      expect((await req(bob.headers, 'POST', `/v1/pipeline/${id}/sent`)).status).toBe(404);
      expect((await t.app.request(`/v1/pipeline/${id}/review`)).status).toBe(401);
    });
  });

  describe('edit draft', () => {
    it('saves, bumps the version, marks it edited; a stale version → 409', async () => {
      const u = await t.signIn();
      const { draftIds } = await addItem(u.userId);
      const path = `/v1/drafts/${draftIds[0]}`;
      const res = await req(u.headers, 'PUT', path, { body: '  New text  ', version: 1 });
      expect(res.status).toBe(200);
      expect(draftSchema.parse(await res.json())).toMatchObject({
        body: 'New text',
        version: 2,
        editedByUser: true,
      });
      const stale = await req(u.headers, 'PUT', path, { body: 'Other', version: 1 });
      expect(stale.status).toBe(409);
      expect(apiErrorSchema.parse(await stale.json()).error.code).toBe('conflict');
      const [row] = await t.db
        .select()
        .from(draft)
        .where(eq(draft.id, draftIds[0] ?? ''));
      expect(row).toMatchObject({ body: 'New text', version: 2 });
      expect((await req(u.headers, 'PUT', path, { body: 'Third', version: 2 })).status).toBe(200);
    });

    it('rejects empty text and text over the draft char limit', async () => {
      const u = await t.signIn();
      const { draftIds } = await addItem(u.userId);
      const limited = `/v1/drafts/${draftIds[1]}`;
      expect((await req(u.headers, 'PUT', limited, { body: '   ', version: 1 })).status).toBe(400);
      const over = await req(u.headers, 'PUT', limited, { body: 'x'.repeat(21), version: 1 });
      expect(over.status).toBe(400);
      expect(apiErrorSchema.parse(await over.json()).error.fields?.body).toMatch(/20/);
      expect(
        (await req(u.headers, 'PUT', limited, { body: 'x'.repeat(20), version: 1 })).status,
      ).toBe(200);
    });
  });

  describe('mark sent / registered / not sent', () => {
    const rowOf = async (id: string) =>
      (await t.db.select().from(pipelineItem).where(eq(pipelineItem.id, id)))[0];
    const followUps = (id: string) =>
      t.db.select().from(followUp).where(eq(followUp.pipelineItemId, id));

    it('sent: status, sentAt, follow-up #1 in 5 days; undo restores everything', async () => {
      const u = await t.signIn();
      const { id } = await addItem(u.userId);
      const res = await req(u.headers, 'POST', `/v1/pipeline/${id}/sent`);
      expect(res.status).toBe(200);
      const result = markSentResultSchema.parse(await res.json());
      const row = await rowOf(id);
      expect(row).toMatchObject({ status: 'sent' });
      expect(row?.sentAt).not.toBeNull();
      const fus = await followUps(id);
      expect(fus).toHaveLength(1);
      expect(fus[0]).toMatchObject({ sequence: 1, status: 'pending' });
      const days = ((fus[0]?.dueAt.getTime() ?? 0) - (row?.sentAt?.getTime() ?? 0)) / 86_400_000;
      expect(days).toBeCloseTo(5, 3);
      expect(result.nextFollowUpAt).toBe(fus[0]?.dueAt.toISOString());
      expect(row?.nextFollowUpAt?.toISOString()).toBe(result.nextFollowUpAt);

      expect(
        (await req(u.headers, 'POST', '/v1/undo', { undoToken: result.undoToken })).status,
      ).toBe(200);
      expect(await rowOf(id)).toMatchObject({
        status: 'ready_to_send',
        sentAt: null,
        nextFollowUpAt: null,
      });
      expect(await followUps(id)).toHaveLength(0);
      expect(
        (await req(u.headers, 'POST', '/v1/undo', { undoToken: result.undoToken })).status,
      ).toBe(409);

      // Can be sent again after an undo.
      expect((await req(u.headers, 'POST', `/v1/pipeline/${id}/sent`)).status).toBe(200);
    });

    it('wrong state → 409 (already sent, not ready, event vs job)', async () => {
      const u = await t.signIn();
      const job = await addItem(u.userId);
      expect((await req(u.headers, 'POST', `/v1/pipeline/${job.id}/sent`)).status).toBe(200);
      expect((await req(u.headers, 'POST', `/v1/pipeline/${job.id}/sent`)).status).toBe(409);
      const prep = await addItem(u.userId, { status: 'preparing' });
      expect((await req(u.headers, 'POST', `/v1/pipeline/${prep.id}/sent`)).status).toBe(409);
      const fresh = await addItem(u.userId);
      expect((await req(u.headers, 'POST', `/v1/pipeline/${fresh.id}/registered`)).status).toBe(
        409,
      );
      const ev = await addItem(u.userId, { type: 'event' });
      expect((await req(u.headers, 'POST', `/v1/pipeline/${ev.id}/sent`)).status).toBe(409);
      expect((await req(u.headers, 'POST', `/v1/pipeline/${fresh.id}/not-sent`)).status).toBe(409);
    });

    it('undo is refused once the status moved on, or the window passed', async () => {
      const u = await t.signIn();
      const { id } = await addItem(u.userId);
      const { undoToken } = markSentResultSchema.parse(
        await (await req(u.headers, 'POST', `/v1/pipeline/${id}/sent`)).json(),
      );
      await t.db.update(pipelineItem).set({ status: 'replied' }).where(eq(pipelineItem.id, id));
      expect((await req(u.headers, 'POST', '/v1/undo', { undoToken })).status).toBe(409);
      await t.db.update(pipelineItem).set({ status: 'sent' }).where(eq(pipelineItem.id, id));
      await t.db
        .update(activity)
        .set({ undoableUntil: new Date(Date.now() - 1000) })
        .where(eq(activity.id, undoToken));
      expect((await req(u.headers, 'POST', '/v1/undo', { undoToken })).status).toBe(409);
      expect(await rowOf(id)).toMatchObject({ status: 'sent' });
    });

    it('registered (events): no follow-up, undo works', async () => {
      const u = await t.signIn();
      const { id } = await addItem(u.userId, { type: 'event' });
      const res = await req(u.headers, 'POST', `/v1/pipeline/${id}/registered`);
      expect(res.status).toBe(200);
      const result = markSentResultSchema.parse(await res.json());
      expect(result.nextFollowUpAt).toBeNull();
      expect(await rowOf(id)).toMatchObject({ status: 'registered' });
      expect((await rowOf(id))?.registeredAt).not.toBeNull();
      expect(await followUps(id)).toHaveLength(0);
      await req(u.headers, 'POST', '/v1/undo', { undoToken: result.undoToken });
      expect(await rowOf(id)).toMatchObject({ status: 'ready_to_send', registeredAt: null });
    });

    it('not sent: back to ready_to_send, follow-up cancelled', async () => {
      const u = await t.signIn();
      const { id } = await addItem(u.userId);
      await req(u.headers, 'POST', `/v1/pipeline/${id}/sent`);
      const res = await req(u.headers, 'POST', `/v1/pipeline/${id}/not-sent`);
      expect(res.status).toBe(200);
      expect(pipelineItemSchema.parse(await res.json())).toMatchObject({
        status: 'ready_to_send',
        sentAt: null,
        nextFollowUpAt: null,
      });
      expect((await followUps(id)).map((f) => f.status)).toEqual(['cancelled']);
    });
  });

  describe('ics', () => {
    it('downloads a calendar file for events only', async () => {
      const u = await t.signIn();
      const ev = await addItem(u.userId, { type: 'event' });
      const res = await req(u.headers, 'GET', `/v1/pipeline/${ev.id}/event.ics`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/calendar');
      expect(res.headers.get('content-disposition')).toContain('.ics');
      const text = await res.text();
      expect(text).toContain('BEGIN:VEVENT');
      expect(text).toContain('SUMMARY:Event\\, ');
      expect(text).toContain(';');
      expect(text).toMatch(/DTSTART:\d{8}T\d{6}Z/);
      expect(text.endsWith('\r\n')).toBe(true);
      const job = await addItem(u.userId);
      expect((await req(u.headers, 'GET', `/v1/pipeline/${job.id}/event.ics`)).status).toBe(409);
      expect((await req(bob.headers, 'GET', `/v1/pipeline/${ev.id}/event.ics`)).status).toBe(404);
    });
  });
});
