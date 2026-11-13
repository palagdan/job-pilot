import type { Db } from '@job-pilot/db/client';
import { eventListing, jobPosting } from '@job-pilot/db/schema/sources';
import { sql } from 'drizzle-orm';
import { mapperFor } from './mappers/registry.ts';
import { dedupeKeyForEvent, dedupeKeyForJob } from './normalize.ts';
import type { IngestKind, MappedEvent, MappedJob } from './types.ts';

const CHUNK_SIZE = 100;

export type IngestResult = { upserted: number; skipped: number };

const chunks = <T>(list: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

const safely = <T>(map: (item: unknown) => T | null, item: unknown): T | null => {
  try {
    return map(item);
  } catch {
    return null;
  }
};

/** Keeps the first row per dedupe key (one upsert statement cannot touch a row twice). */
const uniqueByKey = <T extends { dedupeKey: string }>(rows: T[]) => {
  const seen = new Map<string, T>();
  for (const row of rows) if (!seen.has(row.dedupeKey)) seen.set(row.dedupeKey, row);
  return [...seen.values()];
};

export const ingestItems = async ({
  db,
  sourceId,
  sourceKey,
  kind,
  items,
  now,
}: {
  db: Db;
  sourceId: string;
  sourceKey: string;
  kind: IngestKind;
  items: unknown[];
  now: Date;
}): Promise<IngestResult> => {
  const mapper = mapperFor(sourceKey);
  if (!mapper || mapper.kind !== kind) throw new Error(`No ${kind} mapper for source ${sourceKey}`);

  let upserted = 0;

  if (mapper.kind === 'job') {
    const rows = items.flatMap((item) => {
      const job = safely<MappedJob>(mapper.map, item);
      if (!job) return [];
      const dedupeKey = dedupeKeyForJob({ title: job.title, company: job.company, city: job.city });
      return [{ ...job, sourceId, dedupeKey, firstSeenAt: now, lastSeenAt: now }];
    });
    for (const chunk of chunks(uniqueByKey(rows), CHUNK_SIZE)) {
      await db
        .insert(jobPosting)
        .values(chunk)
        .onConflictDoUpdate({
          target: jobPosting.dedupeKey,
          set: {
            lastSeenAt: now,
            expiredAt: null,
            description: sql`coalesce(nullif(excluded.description, ''), ${jobPosting.description})`,
            salaryRaw: sql`coalesce(nullif(excluded.salary_raw, ''), ${jobPosting.salaryRaw})`,
            workFormats: sql`case when cardinality(excluded.work_formats) > 0 then excluded.work_formats else ${jobPosting.workFormats} end`,
          },
        });
      upserted += chunk.length;
    }
  } else {
    const rows = items.flatMap((item) => {
      const event = safely<MappedEvent>(mapper.map, item);
      if (!event) return [];
      const dedupeKey = dedupeKeyForEvent({
        title: event.title,
        startsAt: event.startsAt,
        city: event.city,
      });
      return [{ ...event, sourceId, dedupeKey, firstSeenAt: now, lastSeenAt: now }];
    });
    for (const chunk of chunks(uniqueByKey(rows), CHUNK_SIZE)) {
      await db
        .insert(eventListing)
        .values(chunk)
        .onConflictDoUpdate({
          target: eventListing.dedupeKey,
          set: {
            lastSeenAt: now,
            description: sql`coalesce(nullif(excluded.description, ''), ${eventListing.description})`,
          },
        });
      upserted += chunk.length;
    }
  }

  return { upserted, skipped: items.length - upserted };
};
