import type { ApifyClient } from '@job-pilot/apify/client';
import type { Db } from '@job-pilot/db/client';
import { source, sourceRun } from '@job-pilot/db/schema/sources';
import type { JobHandler } from '@job-pilot/jobs/client';
import { eq } from 'drizzle-orm';
import { ingestItems } from '../ingest/ingest-items.ts';
import { mapperFor } from '../ingest/mappers/registry.ts';
import type { Log } from '../log.ts';

export type IngestDatasetDeps = {
  db: Db;
  apify: Pick<ApifyClient, 'getDatasetItems'>;
  log: Log;
};

const PAGE_SIZE = 100;

export const ingestDataset =
  ({ db, apify, log }: IngestDatasetDeps): JobHandler<'apify.ingest-dataset'> =>
  async ({ data: { sourceRunId } }) => {
    try {
      const [run] = await db.select().from(sourceRun).where(eq(sourceRun.id, sourceRunId));
      if (!run) {
        log.warn('ingest skipped', { sourceRunId, reason: 'source run not found' });
        return;
      }
      const [src] = await db.select().from(source).where(eq(source.id, run.sourceId));
      const mapper = src ? mapperFor(src.key) : null;
      if (!src || !mapper || !run.apifyDatasetId) {
        log.info('ingest skipped', {
          sourceRunId,
          reason: !mapper ? 'no mapper' : 'no dataset id',
        });
        return;
      }

      const now = new Date();
      let offset = 0;
      let upserted = 0;
      let skipped = 0;
      let target = run.itemsCount ?? Number.POSITIVE_INFINITY;

      while (offset < target) {
        const page = await apify.getDatasetItems(run.apifyDatasetId, {
          offset,
          limit: PAGE_SIZE,
        });
        target = Math.min(target, page.total);
        if (page.items.length === 0) break;
        const result = await ingestItems({
          db,
          sourceId: src.id,
          sourceKey: src.key,
          kind: mapper.kind,
          items: page.items,
          now,
        });
        upserted += result.upserted;
        skipped += result.skipped;
        offset += page.items.length;
      }

      await db.update(sourceRun).set({ ingestedCount: upserted }).where(eq(sourceRun.id, run.id));
      log.info('dataset ingested', { source: src.key, sourceRunId, upserted, skipped });
    } catch (error) {
      log.error('ingest failed', {
        sourceRunId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
