import type { Db } from '@job-pilot/db/client';
import { pipelineItem } from '@job-pilot/db/schema/pipeline';
import { count, eq } from 'drizzle-orm';
import type { PipelineRepository } from '../../application/ports/pipeline-repository.ts';

export const createDrizzlePipelineRepository = (db: Db): PipelineRepository => ({
  countByStatus: async (userId) => {
    const rows = await db
      .select({ status: pipelineItem.status, n: count() })
      .from(pipelineItem)
      .where(eq(pipelineItem.userId, userId))
      .groupBy(pipelineItem.status);
    return Object.fromEntries(rows.map((r) => [r.status, r.n]));
  },
});
