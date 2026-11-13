import { readFileSync } from 'node:fs';
import { createDb } from '@job-pilot/db/client';
import { eventListing, jobPosting, source } from '@job-pilot/db/schema/sources';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { ingestItems } from './ingest-items.ts';
import { mapperFor } from './mappers/registry.ts';
import { dedupeKeyForEvent, dedupeKeyForJob } from './normalize.ts';

const url = process.env.TEST_DATABASE_URL;

const fixture = (key: string): unknown[] =>
  JSON.parse(readFileSync(new URL(`./fixtures/${key}.json`, import.meta.url), 'utf8'));

describe.skipIf(!url)('ingestItems', () => {
  const { db, close } = createDb(url ?? 'postgres://x', { max: 2 });
  const jobKeys = new Set<string>();
  const eventKeys = new Set<string>();

  const sourceId = async (key: string) => {
    const [row] = await db.select({ id: source.id }).from(source).where(eq(source.key, key));
    if (!row) throw new Error(`seed missing source ${key}`);
    return row.id;
  };

  const track = (key: string, kind: 'job' | 'event') => {
    const mapper = mapperFor(key);
    for (const item of fixture(key)) {
      const mapped = mapper?.map(item);
      if (!mapped) continue;
      if ('company' in mapped) {
        jobKeys.add(
          dedupeKeyForJob({ title: mapped.title, company: mapped.company, city: mapped.city }),
        );
      } else if (kind === 'event' && 'startsAt' in mapped) {
        eventKeys.add(
          dedupeKeyForEvent({ title: mapped.title, startsAt: mapped.startsAt, city: mapped.city }),
        );
      }
    }
  };

  const jobRows = () =>
    jobKeys.size
      ? db
          .select()
          .from(jobPosting)
          .where(inArray(jobPosting.dedupeKey, [...jobKeys]))
      : [];

  afterEach(async () => {
    if (jobKeys.size)
      await db.delete(jobPosting).where(inArray(jobPosting.dedupeKey, [...jobKeys]));
    if (eventKeys.size)
      await db.delete(eventListing).where(inArray(eventListing.dedupeKey, [...eventKeys]));
    jobKeys.clear();
    eventKeys.clear();
  });
  afterAll(() => close());

  it('is idempotent: same rows, lastSeenAt advances, firstSeenAt stays', async () => {
    const id = await sourceId('jobs-cz');
    track('jobs-cz', 'job');
    const items = fixture('jobs-cz');
    const t1 = new Date('2026-11-01T10:00:00Z');
    const t2 = new Date('2026-11-02T10:00:00Z');

    const first = await ingestItems({
      db,
      sourceId: id,
      sourceKey: 'jobs-cz',
      kind: 'job',
      items,
      now: t1,
    });
    const before = await jobRows();
    const second = await ingestItems({
      db,
      sourceId: id,
      sourceKey: 'jobs-cz',
      kind: 'job',
      items,
      now: t2,
    });
    const after = await jobRows();

    expect(first.upserted).toBe(items.length);
    expect(second.upserted).toBe(items.length);
    expect(after).toHaveLength(before.length);
    expect(after).toHaveLength(items.length);
    for (const row of after) {
      expect(row.lastSeenAt).toEqual(t2);
      expect(row.firstSeenAt).toEqual(t1);
      expect(row.expiredAt).toBeNull();
    }
  });

  it('reactivates an expired posting and keeps non-empty data', async () => {
    const id = await sourceId('jobs-cz');
    track('jobs-cz', 'job');
    const items = fixture('jobs-cz');
    await ingestItems({
      db,
      sourceId: id,
      sourceKey: 'jobs-cz',
      kind: 'job',
      items,
      now: new Date('2026-11-01T10:00:00Z'),
    });
    await db
      .update(jobPosting)
      .set({ expiredAt: new Date() })
      .where(inArray(jobPosting.dedupeKey, [...jobKeys]));
    const withoutText = items.map((item) => ({
      ...(item as object),
      descriptionText: '',
      description: '',
    }));
    const before = await jobRows();
    await ingestItems({
      db,
      sourceId: id,
      sourceKey: 'jobs-cz',
      kind: 'job',
      items: withoutText,
      now: new Date('2026-11-03T10:00:00Z'),
    });
    const after = await jobRows();
    for (const row of after) {
      expect(row.expiredAt).toBeNull();
      expect(row.description).toBe(before.find((b) => b.id === row.id)?.description);
    }
  });

  it('keeps one row and the first source when two sources list the same job', async () => {
    const first = await sourceId('jobs-cz');
    const second = await sourceId('prace-cz');
    const item = {
      jobId: '1',
      jobUrl: 'https://www.jobs.cz/rpd/999111/',
      title: 'Testovací pozice QA',
      companyName: 'Ingest Test s.r.o.',
      location: 'Praha 4',
      descriptionText: 'První popis',
    };
    const twin = {
      jobKey: 'k',
      canonicalUrl: 'https://x.jobs.cz/pd/999111',
      title: 'Testovací pozice QA',
      company: 'Ingest Test, a.s.',
      location: 'Praha',
      descriptionText: 'Druhý popis',
      sourceCountry: 'CZ',
    };
    jobKeys.add(dedupeKeyForJob({ title: item.title, company: item.companyName, city: 'Praha' }));

    await ingestItems({
      db,
      sourceId: first,
      sourceKey: 'jobs-cz',
      kind: 'job',
      items: [item],
      now: new Date('2026-11-01T10:00:00Z'),
    });
    await ingestItems({
      db,
      sourceId: second,
      sourceKey: 'prace-cz',
      kind: 'job',
      items: [twin],
      now: new Date('2026-11-02T10:00:00Z'),
    });

    const rows = await jobRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sourceId).toBe(first);
    expect(rows[0]?.description).toBe('Druhý popis');
  });

  it('ingests event fixtures', async () => {
    const id = await sourceId('luma-prague');
    track('luma-prague', 'event');
    const items = fixture('luma-prague');
    const result = await ingestItems({
      db,
      sourceId: id,
      sourceKey: 'luma-prague',
      kind: 'event',
      items,
      now: new Date(),
    });
    expect(result.upserted).toBe(items.length);
    const rows = await db
      .select()
      .from(eventListing)
      .where(inArray(eventListing.dedupeKey, [...eventKeys]));
    expect(rows).toHaveLength(items.length);
  });

  it('counts unmappable items as skipped', async () => {
    const id = await sourceId('jobs-cz');
    const result = await ingestItems({
      db,
      sourceId: id,
      sourceKey: 'jobs-cz',
      kind: 'job',
      items: [{}, 'x', null],
      now: new Date(),
    });
    expect(result).toEqual({ upserted: 0, skipped: 3 });
  });
});
