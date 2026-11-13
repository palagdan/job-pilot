import { activity } from '@job-pilot/db/schema/activity';
import { agentRun } from '@job-pilot/db/schema/agent';
import { opportunity } from '@job-pilot/db/schema/opportunities';
import { pipelineItem } from '@job-pilot/db/schema/pipeline';
import { targets } from '@job-pilot/db/schema/profile';
import { eventListing, jobPosting, source } from '@job-pilot/db/schema/sources';
import { agentRunSchema, agentStatusSchema } from '@job-pilot/shared/agent-run';
import { apiErrorSchema } from '@job-pilot/shared/errors';
import { skipResultSchema, todaySchema } from '@job-pilot/shared/opportunity';
import { pipelineItemSchema } from '@job-pilot/shared/pipeline';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, testDatabaseUrl } from '../test/test-app.ts';

/** Integration: real Postgres + sessions; the job queue records calls. */
describe.skipIf(!testDatabaseUrl)('today (integration)', () => {
  const t = createTestApp();
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
        key: `test-${tag}`,
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
    // Opportunities cascade with the users; postings and the source are global.
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
  const addJob = async (
    userId: string,
    fit: number | null,
    extra: { expired?: boolean; company?: string; feedStatus?: 'new' | 'skipped' } = {},
  ) => {
    n++;
    const [posting] = await t.db
      .insert(jobPosting)
      .values({
        sourceId,
        url: `https://example.com/${tag}/${n}`,
        canonicalUrl: `https://example.com/${tag}/${n}`,
        dedupeKey: `${tag}-${n}`,
        title: `Job ${n}`,
        company: extra.company ?? `Company ${n}`,
        raw: {},
        expiredAt: extra.expired ? new Date() : null,
      })
      .returning({ id: jobPosting.id });
    const [opp] = await t.db
      .insert(opportunity)
      .values({
        userId,
        type: 'job',
        jobPostingId: posting?.id,
        fitScore: fit,
        why: `Why ${n}`,
        feedStatus: extra.feedStatus ?? 'new',
      })
      .returning({ id: opportunity.id });
    return opp?.id ?? '';
  };
  const addEvent = async (userId: string, fit: number, startsAt: Date) => {
    n++;
    const [ev] = await t.db
      .insert(eventListing)
      .values({
        sourceId,
        url: `https://example.com/${tag}/e${n}`,
        dedupeKey: `${tag}-e${n}`,
        title: `Event ${n}`,
        startsAt,
        raw: {},
      })
      .returning({ id: eventListing.id });
    const [opp] = await t.db
      .insert(opportunity)
      .values({ userId, type: 'event', eventListingId: ev?.id, fitScore: fit })
      .returning({ id: opportunity.id });
    return opp?.id ?? '';
  };

  const get = (h: Headers, q = '') => t.app.request(`/v1/today${q}`, { headers: h });
  const post = (h: Headers, path: string, body?: unknown) =>
    t.app.request(path, {
      method: 'POST',
      headers: body === undefined ? h : new Headers([...h, ['content-type', 'application/json']]),
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  describe('GET /v1/today', () => {
    let low: string;
    let mid: string;
    let top: string;
    let expired: string;
    let event: string;

    beforeAll(async () => {
      low = await addJob(alice.userId, 30);
      mid = await addJob(alice.userId, 55);
      top = await addJob(alice.userId, 90);
      expired = await addJob(alice.userId, 95, { expired: true });
      event = await addEvent(alice.userId, 70, new Date(Date.now() + 7 * 86_400_000));
      await addJob(alice.userId, null);
      await addJob(alice.userId, 80, { feedStatus: 'skipped' });
      await addJob(bob.userId, 99);
    });

    it('orders by fit, hides < 40 / null / acted-on, puts expired last, counts by type', async () => {
      const res = await get(alice.headers);
      expect(res.status).toBe(200);
      const body = todaySchema.parse(await res.json());
      expect(body.items.map((i) => i.id)).toEqual([top, event, mid, expired]);
      expect(body.items.map((i) => i.feedStatus)).toEqual(['new', 'new', 'new', 'expired']);
      expect(body.items).not.toContainEqual(expect.objectContaining({ id: low }));
      expect(body.counts).toEqual({ all: 4, job: 3, event: 1 });
      expect(body.readyToSendCount).toBe(0);
      expect(body.items[0]).toMatchObject({ sourceName: 'Test Board', why: expect.any(String) });
    });

    it('filters by type but keeps the counts', async () => {
      const body = todaySchema.parse(await (await get(alice.headers, '?type=event')).json());
      expect(body.items.map((i) => i.id)).toEqual([event]);
      expect(body.counts.all).toBe(4);
      expect((await get(alice.headers, '?type=bogus')).status).toBe(400);
    });

    it('is scoped to the user', async () => {
      const body = todaySchema.parse(await (await get(bob.headers)).json());
      expect(body.counts.all).toBe(1);
      expect((await t.app.request('/v1/today')).status).toBe(401);
    });

    it('flags a past event as expired', async () => {
      const carol = await t.signIn();
      const past = await addEvent(carol.userId, 80, new Date(Date.now() - 86_400_000));
      const body = todaySchema.parse(await (await get(carol.headers)).json());
      expect(body.items).toMatchObject([{ id: past, feedStatus: 'expired' }]);
    });
  });

  describe('skip + undo', () => {
    it('skips, hides the card, and undo restores it', async () => {
      const u = await t.signIn();
      const id = await addJob(u.userId, 70);
      const res = await post(u.headers, `/v1/opportunities/${id}/skip`, { reason: 'not_relevant' });
      expect(res.status).toBe(200);
      const { undoToken, addedExclusion } = skipResultSchema.parse(await res.json());
      expect(addedExclusion).toBeNull();
      const [row] = await t.db.select().from(opportunity).where(eq(opportunity.id, id));
      expect(row).toMatchObject({ feedStatus: 'skipped', skipReason: 'not_relevant' });
      expect(todaySchema.parse(await (await get(u.headers)).json()).counts.all).toBe(0);

      expect((await post(u.headers, '/v1/undo', { undoToken })).status).toBe(200);
      const [back] = await t.db.select().from(opportunity).where(eq(opportunity.id, id));
      expect(back).toMatchObject({ feedStatus: 'new', skipReason: null });
      expect(todaySchema.parse(await (await get(u.headers)).json()).counts.all).toBe(1);
      const [act] = await t.db.select().from(activity).where(eq(activity.id, undoToken));
      expect(act?.undoneAt).not.toBeNull();

      const again = await post(u.headers, '/v1/undo', { undoToken });
      expect(again.status).toBe(409);
    });

    it('other users cannot skip or undo it', async () => {
      const u = await t.signIn();
      const id = await addJob(u.userId, 70);
      expect((await post(bob.headers, `/v1/opportunities/${id}/skip`, {})).status).toBe(404);
      const { undoToken } = skipResultSchema.parse(
        await (await post(u.headers, `/v1/opportunities/${id}/skip`, {})).json(),
      );
      expect((await post(bob.headers, '/v1/undo', { undoToken })).status).toBe(404);
    });

    it('validates the reason and note', async () => {
      const u = await t.signIn();
      const id = await addJob(u.userId, 70);
      const path = `/v1/opportunities/${id}/skip`;
      expect((await post(u.headers, path, { reason: 'nope' })).status).toBe(400);
      expect((await post(u.headers, path, { reason: 'just_skip', note: 'x' })).status).toBe(400);
      expect((await post(u.headers, path, { reason: 'other', note: 'x'.repeat(201) })).status).toBe(
        400,
      );
      expect((await post(u.headers, path, { reason: 'other', note: 'Too far' })).status).toBe(200);
    });

    it('company_excluded adds an exclusion that undo removes', async () => {
      const u = await t.signIn();
      await t.db.insert(targets).values({ userId: u.userId, exclusions: [] });
      const id = await addJob(u.userId, 70, { company: 'Acme Agency' });
      const res = skipResultSchema.parse(
        await (
          await post(u.headers, `/v1/opportunities/${id}/skip`, { reason: 'company_excluded' })
        ).json(),
      );
      expect(res.addedExclusion).toBe('Acme Agency');
      const exclusions = async () =>
        (await t.db.select().from(targets).where(eq(targets.userId, u.userId)))[0]?.exclusions;
      expect(await exclusions()).toEqual(['Acme Agency']);
      await post(u.headers, '/v1/undo', { undoToken: res.undoToken });
      expect(await exclusions()).toEqual([]);
    });

    it('an expired undo window → 409', async () => {
      const u = await t.signIn();
      const id = await addJob(u.userId, 70);
      const { undoToken } = skipResultSchema.parse(
        await (await post(u.headers, `/v1/opportunities/${id}/skip`, {})).json(),
      );
      await t.db
        .update(activity)
        .set({ undoableUntil: new Date(Date.now() - 1000) })
        .where(eq(activity.id, undoToken));
      const res = await post(u.headers, '/v1/undo', { undoToken });
      expect(res.status).toBe(409);
      expect(apiErrorSchema.parse(await res.json()).error.message).toMatch(/too late/i);
      const [row] = await t.db.select().from(opportunity).where(eq(opportunity.id, id));
      expect(row?.feedStatus).toBe('skipped');
    });

    it('rejects a malformed or unknown token', async () => {
      expect((await post(alice.headers, '/v1/undo', {})).status).toBe(400);
      expect(
        (await post(alice.headers, '/v1/undo', { undoToken: crypto.randomUUID() })).status,
      ).toBe(404);
    });
  });

  describe('pursue', () => {
    it('creates a preparing pipeline item and enqueues pack.prepare, once', async () => {
      const u = await t.signIn();
      const id = await addJob(u.userId, 80);
      const res = await post(u.headers, `/v1/opportunities/${id}/pursue`);
      expect(res.status).toBe(200);
      const item = pipelineItemSchema.parse(await res.json());
      expect(item).toMatchObject({ opportunityId: id, status: 'preparing', type: 'job' });
      const rows = await t.db.select().from(pipelineItem).where(eq(pipelineItem.userId, u.userId));
      expect(rows).toHaveLength(1);
      const [row] = await t.db.select().from(opportunity).where(eq(opportunity.id, id));
      expect(row?.feedStatus).toBe('pursued');
      expect(t.jobs.packPrepare.filter((x) => x === item.id)).toHaveLength(1);
      expect(todaySchema.parse(await (await get(u.headers)).json()).counts.all).toBe(0);

      const again = pipelineItemSchema.parse(
        await (await post(u.headers, `/v1/opportunities/${id}/pursue`)).json(),
      );
      expect(again.id).toBe(item.id);
      expect(
        await t.db.select().from(pipelineItem).where(eq(pipelineItem.userId, u.userId)),
      ).toHaveLength(1);
    });

    it('404 for someone else’s card, 410 for an expired posting, 409 after skip', async () => {
      const u = await t.signIn();
      const id = await addJob(u.userId, 80);
      expect((await post(bob.headers, `/v1/opportunities/${id}/pursue`)).status).toBe(404);
      const gone = await addJob(u.userId, 80, { expired: true });
      expect((await post(u.headers, `/v1/opportunities/${gone}/pursue`)).status).toBe(410);
      await post(u.headers, `/v1/opportunities/${id}/skip`, {});
      expect((await post(u.headers, `/v1/opportunities/${id}/pursue`)).status).toBe(409);
    });
  });

  describe('dismiss + route', () => {
    it('dismisses an expired card', async () => {
      const u = await t.signIn();
      const id = await addJob(u.userId, 80, { expired: true });
      expect((await post(u.headers, `/v1/opportunities/${id}/dismiss`)).status).toBe(200);
      expect(todaySchema.parse(await (await get(u.headers)).json()).counts.all).toBe(0);
      expect((await post(u.headers, `/v1/opportunities/${id}/dismiss`)).status).toBe(409);
      expect((await post(bob.headers, `/v1/opportunities/${id}/dismiss`)).status).toBe(404);
    });

    it('changes the route to an available one only', async () => {
      const u = await t.signIn();
      const id = await addJob(u.userId, 80);
      const put = (route: string) =>
        t.app.request(`/v1/opportunities/${id}/route`, {
          method: 'PUT',
          headers: new Headers([...u.headers, ['content-type', 'application/json']]),
          body: JSON.stringify({ route }),
        });
      expect((await put('direct')).status).toBe(200);
      expect((await put('event')).status).toBe(400);
    });
  });

  describe('Run now', () => {
    it('queues a manual run, enqueues agent.run, then 409 agent_busy', async () => {
      const u = await t.signIn();
      const res = await post(u.headers, '/v1/agent/runs');
      expect(res.status).toBe(201);
      const run = agentRunSchema.parse(await res.json());
      expect(run).toMatchObject({ trigger: 'manual', status: 'queued', slow: false });
      expect(t.jobs.agentRuns).toContain(run.id);

      const busy = await post(u.headers, '/v1/agent/runs');
      expect(busy.status).toBe(409);
      expect(apiErrorSchema.parse(await busy.json()).error.code).toBe('agent_busy');

      const status = agentStatusSchema.parse(
        await (await t.app.request('/v1/agent/status', { headers: u.headers })).json(),
      );
      expect(status.currentRun?.id).toBe(run.id);
      expect(status.lastRun).toBeNull();

      await t.db
        .update(agentRun)
        .set({ status: 'succeeded', finishedAt: new Date(), newCount: 3 })
        .where(eq(agentRun.id, run.id));
      const after = agentStatusSchema.parse(
        await (await t.app.request('/v1/agent/status', { headers: u.headers })).json(),
      );
      expect(after.currentRun).toBeNull();
      expect(after.lastRun).toMatchObject({ id: run.id, status: 'succeeded', newCount: 3 });
      expect((await post(u.headers, '/v1/agent/runs')).status).toBe(201);
    });

    it('a failing enqueue marks the run failed and does not block the next one', async () => {
      const u = await t.signIn();
      const app = t.build({
        agentJobs: {
          enqueueAgentRun: async () => {
            throw new Error('queue down');
          },
          enqueuePackPrepare: async () => {},
        },
      });
      const res = await app.request('/v1/agent/runs', { method: 'POST', headers: u.headers });
      expect(res.status).toBe(500);
      const [run] = await t.db.select().from(agentRun).where(eq(agentRun.userId, u.userId));
      expect(run?.status).toBe('failed');
      expect((await post(u.headers, '/v1/agent/runs')).status).toBe(201);
    });
  });
});
