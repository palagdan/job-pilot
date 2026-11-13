import type { ApifyClient } from '@job-pilot/apify/client';
import { fillInputTemplate, templatePlaceholders } from '@job-pilot/apify/input-template';
import type { Db } from '@job-pilot/db/client';
import { source, sourceRun } from '@job-pilot/db/schema/sources';
import type { JobHandler, JobQueue } from '@job-pilot/jobs/client';
import { and, desc, eq, gt } from 'drizzle-orm';
import type { Log } from '../log.ts';

export type StartSourceRunDeps = {
  db: Db;
  apify: Pick<ApifyClient, 'startRun'>;
  queue: Pick<JobQueue, 'send'>;
  log: Log;
  maxItems: number;
  maxChargeUsd: number;
};

/** A run still "running" after this long is treated as stuck (see poll-apify-runs). */
export const STALE_RUN_MS = 2 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

export const startSourceRun =
  ({ db, apify, log, maxItems, maxChargeUsd }: StartSourceRunDeps): JobHandler<'source.run'> =>
  async ({ data: { sourceId } }) => {
    const [row] = await db.select().from(source).where(eq(source.id, sourceId));
    if (!row?.enabled || row.provider !== 'apify' || !row.apifyActorId) {
      log.info('source.run skipped', { sourceId, reason: 'missing, disabled or not apify' });
      return;
    }

    const [active] = await db
      .select({ id: sourceRun.id })
      .from(sourceRun)
      .where(
        and(
          eq(sourceRun.sourceId, sourceId),
          eq(sourceRun.status, 'running'),
          gt(sourceRun.startedAt, new Date(Date.now() - STALE_RUN_MS)),
        ),
      )
      .limit(1);
    if (active) {
      log.info('source.run skipped', { source: row.key, reason: 'run already in progress' });
      return;
    }

    const values: Record<string, string | number> = { maxItems };
    if (templatePlaceholders(row.inputTemplate).has('lastRunAt')) {
      const [last] = await db
        .select({ startedAt: sourceRun.startedAt })
        .from(sourceRun)
        .where(and(eq(sourceRun.sourceId, sourceId), eq(sourceRun.status, 'succeeded')))
        .orderBy(desc(sourceRun.startedAt))
        .limit(1);
      values.lastRunAt = (
        last?.startedAt ?? new Date(Date.now() - DEFAULT_LOOKBACK_MS)
      ).toISOString();
    }

    try {
      const input = fillInputTemplate(row.inputTemplate, values);
      const run = await apify.startRun(row.apifyActorId, input, {
        maxItems,
        maxTotalChargeUsd: maxChargeUsd,
      });
      await db.insert(sourceRun).values({
        sourceId,
        apifyRunId: run.id,
        apifyDatasetId: run.defaultDatasetId ?? null,
        status: 'running',
      });
      log.info('source.run started', { source: row.key, apifyRunId: run.id });
    } catch (error) {
      log.error('source.run failed to start', {
        source: row.key,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
