import { agentRun } from '@job-pilot/db/schema/agent';
import { opportunity } from '@job-pilot/db/schema/opportunities';
import { pipelineItem } from '@job-pilot/db/schema/pipeline';
import { schedule } from '@job-pilot/db/schema/profile';
import { eventListing, source } from '@job-pilot/db/schema/sources';
import { agentStatusSchema } from '@job-pilot/shared/agent-run';
import { pipelineStatsSchema } from '@job-pilot/shared/pipeline';
import { meSchema } from '@job-pilot/shared/user';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, testDatabaseUrl } from '../test/test-app.ts';

/** Integration: settings (theme), pause/resume (C07), agent status and pipeline stats. Clock: Fri 13 Nov 2026 10:00Z. */
describe.skipIf(!testDatabaseUrl)('settings, agent, stats (integration)', () => {
  const t = createTestApp({ now: () => new Date('2026-11-13T10:00:00Z') });
  let h: Headers;
  let userId: string;

  const call = (method: string, path: string, body?: unknown) =>
    t.app.request(path, {
      method,
      headers:
        body === undefined
          ? h
          : { cookie: h.get('cookie') ?? '', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const status = async (res: Response) => agentStatusSchema.parse(await res.json());

  beforeAll(async () => {
    await t.setup();
    ({ headers: h, userId } = await t.signIn());
    // Daily 08:00 Prague, next run already in the past (the agent was paused over it).
    await t.db.insert(schedule).values({
      userId,
      frequency: 'daily',
      runHour: 8,
      nextRunAt: new Date('2026-11-10T07:00:00Z'),
    });
  });
  afterAll(() => t.teardown());

  it('theme is stored per user', async () => {
    const res = await call('PATCH', '/v1/me/settings', { theme: 'dark' });
    expect(meSchema.parse(await res.json()).theme).toBe('dark');
    expect((await call('PATCH', '/v1/me/settings', { theme: 'neon' })).status).toBe(400);
  });

  it('C07 pause hides the next run; resume schedules the next slot from now (no catch-up burst)', async () => {
    const paused = await status(await call('POST', '/v1/agent/pause'));
    expect(paused).toMatchObject({ paused: true, nextRunAt: null });
    expect(meSchema.parse(await (await call('GET', '/v1/me')).json()).pausedAt).not.toBeNull();
    expect((await status(await call('POST', '/v1/agent/pause'))).paused).toBe(true); // idempotent

    const resumed = await status(await call('POST', '/v1/agent/resume'));
    // 13 Nov 10:00Z = 11:00 Prague → next 08:00 Prague is 14 Nov 07:00Z (not the stale 10 Nov).
    expect(resumed).toMatchObject({ paused: false, nextRunAt: '2026-11-14T07:00:00.000Z' });
  });

  it('status shows the current and last runs, flags slow runs', async () => {
    await t.db.insert(agentRun).values({
      userId,
      trigger: 'scheduled',
      status: 'succeeded',
      newCount: 4,
      startedAt: new Date('2026-11-12T07:00:00Z'),
      finishedAt: new Date('2026-11-12T07:04:00Z'),
    });
    await t.db.insert(agentRun).values({
      userId,
      trigger: 'manual',
      status: 'running',
      startedAt: new Date('2026-11-13T09:45:00Z'),
    });
    const s = await status(await call('GET', '/v1/agent/status'));
    expect(s.lastRun).toMatchObject({ status: 'succeeded', newCount: 4 });
    expect(s.currentRun).toMatchObject({ status: 'running', trigger: 'manual', slow: true }); // 15 min > 10
  });

  it('pipeline stats count each stage (an interview was also sent and replied)', async () => {
    const [s] = await t.db
      .insert(source)
      .values({
        key: `stats-${userId}`,
        name: 'T',
        kind: 'event',
        baseUrl: 'https://x',
        apifyActorId: 'x',
        cron: '0 0 * * *',
        enabled: false,
      })
      .returning({ id: source.id });
    const statuses = ['ready_to_send', 'ready_to_send', 'sent', 'interview', 'rejected'] as const;
    for (const [i, st] of statuses.entries()) {
      const [ev] = await t.db
        .insert(eventListing)
        .values({
          sourceId: (s as { id: string }).id,
          url: `https://x/${userId}/${i}`,
          dedupeKey: `${userId}-${i}`,
          title: `E${i}`,
          startsAt: new Date(),
          raw: {},
        })
        .returning({ id: eventListing.id });
      const [op] = await t.db
        .insert(opportunity)
        .values({ userId, type: 'event', eventListingId: (ev as { id: string }).id })
        .returning({ id: opportunity.id });
      await t.db
        .insert(pipelineItem)
        .values({ userId, opportunityId: (op as { id: string }).id, route: 'event', status: st });
    }
    const stats = pipelineStatsSchema.parse(await (await call('GET', '/v1/pipeline/stats')).json());
    expect(stats).toEqual({ readyToSend: 2, sent: 3, replied: 1, interviews: 1, offers: 0 });
    await t.db.delete(opportunity).where(eq(opportunity.userId, userId)); // cascades pipeline items
    await t.db.delete(eventListing).where(eq(eventListing.sourceId, (s as { id: string }).id));
    await t.db.delete(source).where(eq(source.id, (s as { id: string }).id));
  });
});
