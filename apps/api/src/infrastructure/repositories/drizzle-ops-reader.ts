import type { Db } from '@job-pilot/db/client';
import { agentRun, llmUsage } from '@job-pilot/db/schema/agent';
import { user } from '@job-pilot/db/schema/auth';
import { eventListing, jobPosting, source, sourceRun } from '@job-pilot/db/schema/sources';
import { and, count, desc, eq, gte, inArray, isNull, sql, sum } from 'drizzle-orm';
import type { OpsReader } from '../../application/ports/ops-reader.ts';

const n = (v: unknown) => Number(v ?? 0);

const tokenColumns = {
  calls: count(),
  failed: sql<number>`count(*) filter (where ${llmUsage.succeeded} = false)`,
  inputTokens: sum(llmUsage.inputTokens),
  outputTokens: sum(llmUsage.outputTokens),
};
const toTokens = (r: {
  calls: unknown;
  failed: unknown;
  inputTokens: unknown;
  outputTokens: unknown;
}) => ({
  calls: n(r.calls),
  failed: n(r.failed),
  inputTokens: n(r.inputTokens),
  outputTokens: n(r.outputTokens),
});

export const createDrizzleOpsReader = (db: Db): OpsReader => ({
  summary: async (since, now) => {
    const sources = await db
      .select({
        key: source.key,
        name: source.name,
        kind: source.kind,
        enabled: source.enabled,
        runs: sql<number>`count(${sourceRun.id})`,
        failedRuns: sql<number>`count(${sourceRun.id}) filter (where ${sourceRun.status} in ('failed', 'timed_out', 'aborted'))`,
        itemsFound: sql<number>`coalesce(sum(${sourceRun.itemsCount}), 0)`,
        itemsIngested: sql<number>`coalesce(sum(${sourceRun.ingestedCount}), 0)`,
        costUsd: sql<number>`coalesce(sum(${sourceRun.costUsd}), 0)`,
      })
      .from(source)
      .leftJoin(sourceRun, and(eq(sourceRun.sourceId, source.id), gte(sourceRun.startedAt, since)))
      .groupBy(source.id)
      .orderBy(source.key);

    // Latest run per source (any age), for status + error.
    const latest = await db
      .selectDistinctOn([sourceRun.sourceId], {
        key: source.key,
        startedAt: sourceRun.startedAt,
        status: sourceRun.status,
        error: sourceRun.error,
      })
      .from(sourceRun)
      .innerJoin(source, eq(source.id, sourceRun.sourceId))
      .orderBy(sourceRun.sourceId, desc(sourceRun.startedAt));
    const latestByKey = new Map(latest.map((l) => [l.key, l]));

    const [jobs] = await db
      .select({ n: count() })
      .from(jobPosting)
      .where(isNull(jobPosting.expiredAt));
    const [events] = await db
      .select({ n: count() })
      .from(eventListing)
      .where(and(gte(eventListing.startsAt, now), isNull(eventListing.cancelledAt)));

    const [runs] = await db
      .select({
        total: count(),
        failed: sql<number>`count(*) filter (where ${agentRun.status} = 'failed')`,
      })
      .from(agentRun)
      .where(gte(agentRun.createdAt, since));
    const [active] = await db
      .select({ n: count() })
      .from(agentRun)
      .where(inArray(agentRun.status, ['queued', 'running']));

    const [totals] = await db
      .select(tokenColumns)
      .from(llmUsage)
      .where(gte(llmUsage.createdAt, since));
    const byTask = await db
      .select({ task: llmUsage.task, ...tokenColumns })
      .from(llmUsage)
      .where(gte(llmUsage.createdAt, since))
      .groupBy(llmUsage.task)
      .orderBy(llmUsage.task);
    const byUser = await db
      .select({ email: user.email, ...tokenColumns })
      .from(llmUsage)
      .innerJoin(user, eq(user.id, llmUsage.userId))
      .where(gte(llmUsage.createdAt, since))
      .groupBy(user.email)
      .orderBy(desc(sql`sum(${llmUsage.inputTokens}) + sum(${llmUsage.outputTokens})`))
      .limit(20);

    return {
      sources: sources.map((s) => {
        const last = latestByKey.get(s.key);
        return {
          key: s.key,
          name: s.name,
          kind: s.kind,
          enabled: s.enabled,
          runs: n(s.runs),
          failedRuns: n(s.failedRuns),
          itemsFound: n(s.itemsFound),
          itemsIngested: n(s.itemsIngested),
          costUsd: Math.round(n(s.costUsd) * 10_000) / 10_000,
          lastRunAt: last?.startedAt.toISOString() ?? null,
          lastStatus: last?.status ?? null,
          lastError: last?.error ?? null,
        };
      }),
      inventory: { activeJobs: n(jobs?.n), upcomingEvents: n(events?.n) },
      agentRuns: { total: n(runs?.total), failed: n(runs?.failed), active: n(active?.n) },
      llm: {
        totals: toTokens(totals ?? { calls: 0, failed: 0, inputTokens: 0, outputTokens: 0 }),
        byTask: byTask.map((t) => ({ task: t.task, ...toTokens(t) })),
        byUser: byUser.map((u) => ({ email: u.email, ...toTokens(u) })),
      },
    };
  },
});
