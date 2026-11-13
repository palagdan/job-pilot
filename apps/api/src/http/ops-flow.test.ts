import { agentRun, llmUsage } from '@job-pilot/db/schema/agent';
import { source, sourceRun } from '@job-pilot/db/schema/sources';
import { opsSchema } from '@job-pilot/shared/ops';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, testDatabaseUrl } from '../test/test-app.ts';

/** Integration: ops view aggregates (admin `ops-admin@example.com` in the test app), 403 for everyone else. */
describe.skipIf(!testDatabaseUrl)('ops view (integration)', () => {
  const t = createTestApp({ now: () => new Date('2026-11-13T10:00:00Z') });
  const key = `ops-${crypto.randomUUID().slice(0, 8)}`;
  let admin: Headers;
  let user: Headers;
  let userId: string;
  let sourceId: string;

  beforeAll(async () => {
    await t.setup();
    admin = (await t.signIn({ email: 'ops-admin@example.com' })).headers;
    ({ headers: user, userId } = await t.signIn());
    const [s] = await t.db
      .insert(source)
      .values({
        key,
        name: 'Ops Test',
        kind: 'job',
        baseUrl: 'https://x',
        apifyActorId: 'x',
        cron: '0 0 * * *',
        enabled: true,
      })
      .returning({ id: source.id });
    sourceId = (s as { id: string }).id;
    await t.db.insert(sourceRun).values([
      {
        sourceId,
        apifyRunId: `${key}-1`,
        status: 'succeeded',
        startedAt: new Date('2026-11-12T06:00:00Z'),
        itemsCount: 40,
        ingestedCount: 35,
        costUsd: '0.1200',
      },
      {
        sourceId,
        apifyRunId: `${key}-2`,
        status: 'failed',
        startedAt: new Date('2026-11-13T06:00:00Z'),
        error: 'Actor timed out',
      },
      {
        sourceId,
        apifyRunId: `${key}-old`,
        status: 'succeeded',
        startedAt: new Date('2026-10-01T06:00:00Z'),
        itemsCount: 99,
      }, // outside 7 days
    ]);
    await t.db.insert(agentRun).values({
      userId,
      trigger: 'scheduled',
      status: 'failed',
      createdAt: new Date('2026-11-12T07:00:00Z'),
    });
    await t.db.insert(llmUsage).values([
      {
        userId,
        task: 'parse_cv',
        model: 'm',
        inputTokens: 1000,
        outputTokens: 200,
        durationMs: 1,
        succeeded: true,
        createdAt: new Date('2026-11-12T08:00:00Z'),
      },
      {
        userId,
        task: 'rank',
        model: 'm',
        inputTokens: 500,
        outputTokens: 50,
        durationMs: 1,
        succeeded: false,
        createdAt: new Date('2026-11-12T08:00:00Z'),
      },
    ]);
  });
  afterAll(async () => {
    await t.db.delete(sourceRun).where(eq(sourceRun.sourceId, sourceId));
    await t.db.delete(source).where(eq(source.id, sourceId));
    await t.teardown();
  });

  it('is forbidden for regular users', async () => {
    expect((await t.app.request('/v1/admin/ops', { headers: user })).status).toBe(403);
  });

  it('summarises sources, runs and LLM usage over 7 days', async () => {
    const ops = opsSchema.parse(
      await (await t.app.request('/v1/admin/ops', { headers: admin })).json(),
    );
    expect(ops.windowDays).toBe(7);
    expect(ops.sources.find((s) => s.key === key)).toEqual({
      key,
      name: 'Ops Test',
      kind: 'job',
      enabled: true,
      runs: 2,
      failedRuns: 1,
      itemsFound: 40,
      itemsIngested: 35,
      costUsd: 0.12,
      lastRunAt: '2026-11-13T06:00:00.000Z',
      lastStatus: 'failed',
      lastError: 'Actor timed out',
    });
    expect(ops.agentRuns.failed).toBeGreaterThanOrEqual(1);
    const mine = ops.llm.byUser.find((u) => u.email !== 'ops-admin@example.com' && u.calls === 2);
    expect(mine).toMatchObject({ calls: 2, failed: 1, inputTokens: 1500, outputTokens: 250 });
    expect(ops.llm.byTask.map((b) => b.task)).toEqual(expect.arrayContaining(['parse_cv', 'rank']));
  });
});
