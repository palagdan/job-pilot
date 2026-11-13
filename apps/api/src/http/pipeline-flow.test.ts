import { activity } from '@job-pilot/db/schema/activity';
import { cv } from '@job-pilot/db/schema/cv';
import { opportunity } from '@job-pilot/db/schema/opportunities';
import { followUp, pipelineItem } from '@job-pilot/db/schema/pipeline';
import { eventListing, jobPosting, source } from '@job-pilot/db/schema/sources';
import { cvListSchema } from '@job-pilot/shared/cv';
import type { PipelineStatus } from '@job-pilot/shared/enums';
import {
  noteSchema,
  pipelineItemSchema,
  pipelinePageSchema,
  pipelineStatsSchema,
} from '@job-pilot/shared/pipeline';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createTestApp, testDatabaseUrl } from '../test/test-app.ts';

/** Integration: 10 Pipeline endpoints. Clock: Fri 13 Nov 2026 10:00Z; users are in Europe/Prague (UTC+1). */
describe.skipIf(!testDatabaseUrl)('pipeline (integration)', () => {
  const now = new Date('2026-11-13T10:00:00Z');
  const t = createTestApp({ now: () => now });
  let alice: { headers: Headers; userId: string };
  let bob: { headers: Headers; userId: string };
  let sourceId: string;
  const tag = crypto.randomUUID();

  beforeAll(async () => {
    await t.setup();
    alice = await t.signIn();
    bob = await t.signIn();
    const [src] = await t.db
      .insert(source)
      .values({
        key: `pipe-${tag}`,
        name: 'Test Board',
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

  let n = 0;
  /** A job in the pipeline. `createdAt` grows with `n` so "newest" is deterministic. */
  const addJob = async (
    userId: string,
    status: PipelineStatus,
    extra: { company?: string; nextFollowUpAt?: Date; interviewAt?: Date } = {},
  ) => {
    n++;
    const [posting] = await t.db
      .insert(jobPosting)
      .values({
        sourceId,
        url: `https://example.com/${tag}/${n}`,
        canonicalUrl: `https://example.com/${tag}/${n}`,
        dedupeKey: `${tag}-${n}`,
        title: `Role ${n}`,
        company: extra.company ?? `Company ${n}`,
        raw: {},
      })
      .returning({ id: jobPosting.id });
    const [opp] = await t.db
      .insert(opportunity)
      .values({
        userId,
        type: 'job',
        jobPostingId: posting?.id,
        route: 'direct',
        feedStatus: 'pursued',
      })
      .returning({ id: opportunity.id });
    const [item] = await t.db
      .insert(pipelineItem)
      .values({
        userId,
        opportunityId: opp?.id ?? '',
        route: 'direct',
        status,
        nextFollowUpAt: extra.nextFollowUpAt,
        interviewAt: extra.interviewAt,
        createdAt: new Date(now.getTime() - 3_600_000 + n * 1000),
      })
      .returning({ id: pipelineItem.id });
    return item?.id ?? '';
  };
  const addEvent = async (userId: string, status: PipelineStatus, startsAt: Date) => {
    n++;
    const [ev] = await t.db
      .insert(eventListing)
      .values({
        sourceId,
        url: `https://example.com/${tag}/e${n}`,
        dedupeKey: `${tag}-e${n}`,
        title: `Meetup ${n}`,
        organizer: 'Organizer',
        startsAt,
        raw: {},
      })
      .returning({ id: eventListing.id });
    const [opp] = await t.db
      .insert(opportunity)
      .values({
        userId,
        type: 'event',
        eventListingId: ev?.id,
        route: 'event',
        feedStatus: 'pursued',
      })
      .returning({ id: opportunity.id });
    const [item] = await t.db
      .insert(pipelineItem)
      .values({
        userId,
        opportunityId: opp?.id ?? '',
        route: 'event',
        status,
        createdAt: new Date(now.getTime() - 3_600_000 + n * 1000),
      })
      .returning({ id: pipelineItem.id });
    return item?.id ?? '';
  };

  const req = (h: Headers, method: string, path: string, body?: unknown) =>
    t.app.request(path, {
      method,
      headers: body === undefined ? h : new Headers([...h, ['content-type', 'application/json']]),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const list = async (h: Headers, q = '') => {
    const res = await req(h, 'GET', `/v1/pipeline${q}`);
    expect(res.status).toBe(200);
    return pipelinePageSchema.parse(await res.json());
  };
  const item = async (res: Response) => {
    expect(res.status).toBe(200);
    return pipelineItemSchema.parse(await res.json());
  };

  let ready: string;
  let sent: string;
  let interview: string;
  let event: string;
  let other: string;

  beforeAll(async () => {
    ready = await addJob(alice.userId, 'ready_to_send', { company: 'zeta' });
    sent = await addJob(alice.userId, 'sent', {
      company: 'Alpha',
      nextFollowUpAt: new Date('2026-11-18T08:00:00Z'),
    });
    interview = await addJob(alice.userId, 'interview', {
      company: 'Mid',
      interviewAt: new Date('2026-11-16T10:00:00Z'),
    });
    event = await addEvent(alice.userId, 'registered', new Date('2026-11-19T17:00:00Z'));
    other = await addJob(bob.userId, 'sent');
    await t.db.insert(followUp).values({
      pipelineItemId: sent,
      sequence: 1,
      dueAt: new Date('2026-11-18T08:00:00Z'),
    });
    const [master] = await t.db
      .insert(cv)
      .values({ userId: alice.userId, kind: 'master', version: 2, status: 'confirmed' })
      .returning({ id: cv.id });
    await t.db.insert(cv).values({
      userId: alice.userId,
      kind: 'special',
      pipelineItemId: ready,
      basedOnCvId: master?.id,
      status: 'ready_to_send',
      changes: ['Headline', 'Bullets'],
    });
  });

  it('09 CVs: special CVs name their application and the master version they came from', async () => {
    const res = await req(alice.headers, 'GET', '/v1/cvs');
    const list = cvListSchema.parse(await res.json());
    expect(list.special).toHaveLength(1);
    expect(list.special[0]).toMatchObject({
      pipelineItemId: ready,
      basedOnVersion: 2,
      status: 'ready_to_send',
      fileBaseName: `CV - zeta - Role ${n - 4}`,
    });
    expect(list.master?.basedOnVersion).toBeNull();
  });

  it('lists only the owner\'s items with the "Next follow-up" text in their time zone', async () => {
    const page = await list(alice.headers);
    expect(page.items.map((i) => i.id).sort()).toEqual([ready, sent, interview, event].sort());
    expect(page.nextCursor).toBeNull();
    const byId = Object.fromEntries(page.items.map((i) => [i.id, i]));
    expect(byId[ready]).toMatchObject({ nextStep: 'Send it yourself', company: 'zeta' });
    expect(byId[ready]?.specialCvId).not.toBeNull();
    expect(byId[sent]?.nextStep).toBe('Follow up on 18 Nov');
    expect(byId[interview]?.nextStep).toBe('Mon 16 Nov, 11:00');
    expect(byId[event]).toMatchObject({
      type: 'event',
      title: `Meetup ${n - 1}`,
      company: 'Organizer',
      nextStep: 'Thu 19 Nov, 18:00',
    });
  });

  it('sorts by next follow-up (default), newest, status and company', async () => {
    const ids = async (q: string) => (await list(alice.headers, q)).items.map((i) => i.id);
    // interview 16 Nov → follow-up 18 Nov → event 19 Nov → nothing scheduled.
    expect(await ids('')).toEqual([interview, sent, event, ready]);
    expect(await ids('?sort=newest')).toEqual([event, interview, sent, ready]);
    expect(await ids('?sort=status')).toEqual([ready, sent, event, interview]);
    // Case-insensitive: Alpha, Mid, Organizer, zeta.
    expect(await ids('?sort=company')).toEqual([sent, interview, event, ready]);
    expect((await req(alice.headers, 'GET', '/v1/pipeline?sort=random')).status).toBe(400);
  });

  it('filters by status group AND type, and pages with a cursor', async () => {
    const ids = async (q: string) => (await list(alice.headers, q)).items.map((i) => i.id);
    expect(await ids('?statusGroup=in_progress')).toEqual([sent, event]);
    expect(await ids('?statusGroup=in_progress&type=job')).toEqual([sent]);
    expect(await ids('?statusGroup=closed')).toEqual([]);

    const first = await list(alice.headers, '?sort=newest&limit=3');
    expect(first.items).toHaveLength(3);
    expect(first.nextCursor).toBe('3');
    const second = await list(alice.headers, `?sort=newest&limit=3&cursor=${first.nextCursor}`);
    expect(second.items.map((i) => i.id)).toEqual([ready]);
    expect(second.nextCursor).toBeNull();
    expect((await req(alice.headers, 'GET', '/v1/pipeline?cursor=abc')).status).toBe(400);
  });

  it("gets one item; others' items are 404", async () => {
    expect((await item(await req(alice.headers, 'GET', `/v1/pipeline/${sent}`))).id).toBe(sent);
    expect((await req(alice.headers, 'GET', `/v1/pipeline/${other}`)).status).toBe(404);
    expect((await req(alice.headers, 'GET', '/v1/pipeline/not-a-uuid')).status).toBe(400);
  });

  it('marks as replied: cancels pending follow-ups and logs the change', async () => {
    const replied = await item(
      await req(alice.headers, 'PUT', `/v1/pipeline/${sent}/status`, { status: 'replied' }),
    );
    expect(replied).toMatchObject({
      status: 'replied',
      nextFollowUpAt: null,
      nextStep: 'Reply to them',
      statusChangedAt: now.toISOString(),
    });
    const [fu] = await t.db.select().from(followUp).where(eq(followUp.pipelineItemId, sent));
    expect(fu?.status).toBe('cancelled');
    const log = await t.db
      .select()
      .from(activity)
      .where(and(eq(activity.entityId, sent), eq(activity.action, 'pipeline.status')));
    expect(log[0]?.before).toMatchObject({ status: 'sent' });
  });

  it('interview stores the date; not before sending; not for events; not for others', async () => {
    const at = '2026-11-20T13:30:00.000Z';
    const res = await item(
      await req(alice.headers, 'PUT', `/v1/pipeline/${sent}/status`, {
        status: 'interview',
        interviewAt: at,
      }),
    );
    expect(res).toMatchObject({
      status: 'interview',
      interviewAt: at,
      nextStep: 'Fri 20 Nov, 14:30',
    });

    const put = (id: string, h = alice.headers) =>
      req(h, 'PUT', `/v1/pipeline/${id}/status`, { status: 'offer' });
    expect((await put(ready)).status).toBe(409);
    expect((await put(event)).status).toBe(409);
    expect((await put(other)).status).toBe(404);
    expect(
      (await req(alice.headers, 'PUT', `/v1/pipeline/${sent}/status`, { status: 'sent' })).status,
    ).toBe(400);
  });

  it('changes the route before sending: back to Preparing and the pack is rewritten', async () => {
    const before = t.jobs.packPrepare.length;
    const res = await item(
      await req(alice.headers, 'PUT', `/v1/pipeline/${ready}/route`, { route: 'auto' }),
    );
    expect(res).toMatchObject({
      route: 'auto',
      status: 'preparing',
      nextStep: 'Preparing your pack',
    });
    expect(t.jobs.packPrepare.slice(before)).toEqual([ready]);
    const [opp] = await t.db
      .select({ route: opportunity.route })
      .from(opportunity)
      .innerJoin(pipelineItem, eq(pipelineItem.opportunityId, opportunity.id))
      .where(eq(pipelineItem.id, ready));
    expect(opp?.route).toBe('auto');

    const route = (id: string, r: string) =>
      req(alice.headers, 'PUT', `/v1/pipeline/${id}/route`, { route: r });
    expect((await route(ready, 'event')).status).toBe(400); // jobs have no event route
    expect((await route(sent, 'auto')).status).toBe(409); // already sent
    // Same route: no-op, nothing enqueued.
    const count = t.jobs.packPrepare.length;
    expect((await item(await route(ready, 'auto'))).status).toBe('preparing');
    expect(t.jobs.packPrepare.length).toBe(count);
  });

  it('C06 stop pursuing → Skipped, follow-ups cancelled; idempotent', async () => {
    await t.db
      .update(pipelineItem)
      .set({ nextFollowUpAt: new Date('2026-11-25T08:00:00Z') })
      .where(eq(pipelineItem.id, event));
    await t.db
      .insert(followUp)
      .values({ pipelineItemId: event, sequence: 1, dueAt: new Date('2026-11-25T08:00:00Z') });
    const stopped = await item(await req(alice.headers, 'POST', `/v1/pipeline/${event}/stop`));
    expect(stopped).toMatchObject({ status: 'skipped', nextFollowUpAt: null, nextStep: null });
    const fus = await t.db.select().from(followUp).where(eq(followUp.pipelineItemId, event));
    expect(fus.every((f) => f.status === 'cancelled')).toBe(true);
    expect(
      (await item(await req(alice.headers, 'POST', `/v1/pipeline/${event}/stop`))).status,
    ).toBe('skipped');
    expect((await req(alice.headers, 'POST', `/v1/pipeline/${other}/stop`)).status).toBe(404);
    expect((await list(alice.headers, '?statusGroup=closed')).items.map((i) => i.id)).toEqual([
      event,
    ]);
  });

  it('notes: add, list newest first, count on the item, owner only, length limit', async () => {
    const add = (body: string, h = alice.headers, id = interview) =>
      req(h, 'POST', `/v1/pipeline/${id}/notes`, { body });
    const first = await add('Recruiter is Jana');
    expect(first.status).toBe(201);
    noteSchema.parse(await first.json());
    expect((await add('  Prefers mornings  ')).status).toBe(201);
    const notes = z
      .array(noteSchema)
      .parse(await (await req(alice.headers, 'GET', `/v1/pipeline/${interview}/notes`)).json());
    expect(notes.map((x) => x.body)).toEqual(['Prefers mornings', 'Recruiter is Jana']);
    expect(
      (await item(await req(alice.headers, 'GET', `/v1/pipeline/${interview}`))).notesCount,
    ).toBe(2);

    expect((await add('   ')).status).toBe(400);
    expect((await add('x'.repeat(2001))).status).toBe(400);
    expect((await add('hi', bob.headers)).status).toBe(404);
    expect((await req(bob.headers, 'GET', `/v1/pipeline/${interview}/notes`)).status).toBe(404);
  });

  it('stats follow the changes', async () => {
    const stats = pipelineStatsSchema.parse(
      await (await req(alice.headers, 'GET', '/v1/pipeline/stats')).json(),
    );
    // sent → interview (sent, replied, interviews); interview; ready → preparing; event → skipped.
    expect(stats).toEqual({ readyToSend: 0, sent: 2, replied: 2, interviews: 2, offers: 0 });
  });

  it('follow-ups: shown on the row, "Mark follow-up as sent" schedules the 2nd, then none', async () => {
    const id = await addJob(bob.userId, 'sent', {
      nextFollowUpAt: new Date('2026-11-12T08:00:00Z'),
    });
    const [fu] = await t.db
      .insert(followUp)
      .values({ pipelineItemId: id, sequence: 1, dueAt: new Date('2026-11-12T08:00:00Z') })
      .returning({ id: followUp.id });
    const fuId = fu?.id ?? '';
    const row = await item(await req(bob.headers, 'GET', `/v1/pipeline/${id}`));
    expect(row.followUp).toEqual({
      id: fuId,
      sequence: 1,
      dueAt: '2026-11-12T08:00:00.000Z',
      due: true,
    });
    expect(row.nextStep).toBe('Follow-up due');

    expect((await req(alice.headers, 'POST', `/v1/follow-ups/${fuId}/done`)).status).toBe(404);
    expect((await req(bob.headers, 'POST', `/v1/follow-ups/${fuId}/done`)).status).toBe(200);
    expect((await req(bob.headers, 'POST', `/v1/follow-ups/${fuId}/done`)).status).toBe(409); // already handled

    const after = await item(await req(bob.headers, 'GET', `/v1/pipeline/${id}`));
    expect(after.followUp).toMatchObject({
      sequence: 2,
      dueAt: '2026-11-20T10:00:00.000Z',
      due: false,
    });
    expect(after.nextFollowUpAt).toBe('2026-11-20T10:00:00.000Z');
    expect(after.nextStep).toBe('Second follow-up on 20 Nov');
    const all = await t.db.select().from(followUp).where(eq(followUp.pipelineItemId, id));
    expect(all.map((f) => [f.sequence, f.status]).sort()).toEqual([
      [1, 'done'],
      [2, 'pending'],
    ]);

    await req(bob.headers, 'POST', `/v1/follow-ups/${after.followUp?.id}/done`);
    const last = await item(await req(bob.headers, 'GET', `/v1/pipeline/${id}`));
    expect(last).toMatchObject({
      followUp: null,
      nextFollowUpAt: null,
      nextStep: 'Wait for a reply',
    });
  });

  it('a cancelled follow-up cannot be marked as sent', async () => {
    const id = await addJob(bob.userId, 'sent');
    const [fu] = await t.db
      .insert(followUp)
      .values({ pipelineItemId: id, sequence: 1, dueAt: now, status: 'cancelled' })
      .returning({ id: followUp.id });
    expect((await req(bob.headers, 'POST', `/v1/follow-ups/${fu?.id}/done`)).status).toBe(409);
  });
});
