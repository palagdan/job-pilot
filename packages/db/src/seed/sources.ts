import type { Db } from '../client.ts';
import { source } from '../schema/sources.ts';

type NewSource = typeof source.$inferInsert;

/**
 * Starter rows for the source list. All disabled with placeholder actor ids:
 * Daniil's source research (M0) fills in real Apify actors, inputs and ToS notes.
 */
const starterSources: NewSource[] = [
  {
    key: 'jobs-cz',
    name: 'Jobs.cz',
    kind: 'job',
    baseUrl: 'https://www.jobs.cz',
    apifyActorId: 'todo/jobs-cz',
    cron: '0 */6 * * *',
    enabled: false,
    notes: 'Placeholder — pending source research.',
  },
  {
    key: 'startupjobs-cz',
    name: 'StartupJobs',
    kind: 'job',
    baseUrl: 'https://www.startupjobs.cz',
    apifyActorId: 'todo/startupjobs-cz',
    cron: '0 */6 * * *',
    enabled: false,
    notes: 'Placeholder — pending source research.',
  },
  {
    key: 'luma-prague',
    name: 'Luma — Prague',
    kind: 'event',
    baseUrl: 'https://lu.ma/prague',
    apifyActorId: 'todo/luma',
    cron: '0 5 * * *',
    enabled: false,
    notes: 'Placeholder — pending source research.',
  },
];

/** Inserts missing sources; never overwrites rows that were edited later. Returns the number of rows inserted. */
export const seedSources = async (db: Db): Promise<number> => {
  const inserted = await db
    .insert(source)
    .values(starterSources)
    .onConflictDoNothing({ target: source.key })
    .returning({ id: source.id });
  return inserted.length;
};
