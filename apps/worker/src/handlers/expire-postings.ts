import type { Db } from '@job-pilot/db/client';
import { jobPosting } from '@job-pilot/db/schema/sources';
import type { JobHandler } from '@job-pilot/jobs/client';
import { and, isNull, lt } from 'drizzle-orm';
import type { Log } from '../log.ts';

export const EXPIRE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export const expirePostings =
  ({ db, log }: { db: Db; log: Log }): JobHandler<'ingest.expire'> =>
  async () => {
    const now = new Date();
    const expired = await db
      .update(jobPosting)
      .set({ expiredAt: now })
      .where(
        and(
          isNull(jobPosting.expiredAt),
          lt(jobPosting.lastSeenAt, new Date(now.getTime() - EXPIRE_AFTER_MS)),
        ),
      )
      .returning({ id: jobPosting.id });
    log.info('postings expired', { count: expired.length });
  };
