import type { Db } from '@job-pilot/db/client';
import { source } from '@job-pilot/db/schema/sources';
import type { JobQueue } from '@job-pilot/jobs/client';
import { and, eq } from 'drizzle-orm';
import type { Log } from '../log.ts';

const TZ = 'Europe/Prague';

/** Keeps pg-boss schedules in sync with the enabled Apify sources. Runs on every worker start. */
export const scheduleSources = async ({
  db,
  queue,
  log,
}: {
  db: Db;
  queue: Pick<JobQueue, 'schedule' | 'unschedule' | 'scheduleKeys'>;
  log: Log;
}) => {
  const sources = await db
    .select({ key: source.key, id: source.id, cron: source.cron })
    .from(source)
    .where(and(eq(source.provider, 'apify'), eq(source.enabled, true)));

  const wanted = new Set(sources.map((s) => s.key));
  for (const s of sources) {
    await queue.schedule('source.run', s.cron, { sourceId: s.id }, { tz: TZ, key: s.key });
  }
  for (const key of await queue.scheduleKeys('source.run')) {
    if (key && !wanted.has(key)) {
      await queue.unschedule('source.run', key);
      log.info('unscheduled source', { key });
    }
  }

  await queue.schedule('apify.poll-runs', '* * * * *', {}, { tz: TZ });
  log.info('sources scheduled', { count: sources.length });
};
