import { randomUUID } from 'node:crypto';
import { createDb } from '@job-pilot/db/client';
import { user } from '@job-pilot/db/schema/auth';
import { opportunity } from '@job-pilot/db/schema/opportunities';
import { eventListing, jobPosting, source } from '@job-pilot/db/schema/sources';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildKeywords, selectEventCandidates, selectJobCandidates } from './prefilter.ts';

const url = process.env.TEST_DATABASE_URL;

describe('buildKeywords', () => {
  it('drops stop words, adds Czech equivalents and skills', () => {
    const k = buildKeywords(['Senior Full Stack Developer', 'CMO'], ['TypeScript', 'Go']);
    expect(k).toEqual(
      expect.arrayContaining(['stack', 'developer', 'vývojář', 'cmo', 'typescript']),
    );
    expect(k).not.toContain('senior');
    expect(k).not.toContain('go');
  });
  it('keeps stop words when nothing else is left', () => {
    expect(buildKeywords(['Manager'], [])).toEqual(expect.arrayContaining(['manager', 'manažer']));
  });
});

describe.skipIf(!url)('prefilter', () => {
  const { db, close } = createDb(url ?? 'postgres://x', { max: 2 });
  const tag = randomUUID().slice(0, 8);
  const city = `Testville${tag}`;
  const word = `zxq${tag}`;
  let userId = '';
  let sourceId = '';
  const ids: Record<string, string> = {};
  const eventIds: Record<string, string> = {};
  const day = 24 * 60 * 60 * 1000;

  const job = async (
    key: string,
    v: Partial<typeof jobPosting.$inferInsert> & { title: string },
  ) => {
    const [row] = await db
      .insert(jobPosting)
      .values({
        sourceId,
        url: `https://x/${tag}/${key}`,
        canonicalUrl: `https://x/${tag}/${key}`,
        dedupeKey: `${tag}-${key}`,
        company: `Acme ${tag}`,
        city,
        raw: {},
        ...v,
      })
      .returning({ id: jobPosting.id });
    ids[key] = (row as { id: string }).id;
  };
  const event = async (key: string, v: Partial<typeof eventListing.$inferInsert> = {}) => {
    const [row] = await db
      .insert(eventListing)
      .values({
        sourceId,
        url: `https://x/${tag}/e-${key}`,
        dedupeKey: `${tag}-e-${key}`,
        title: `Meetup ${key}`,
        startsAt: new Date(Date.now() + 5 * day),
        city,
        raw: {},
        ...v,
      })
      .returning({ id: eventListing.id });
    eventIds[key] = (row as { id: string }).id;
  };

  const targets = {
    roles: [`Senior ${word} Developer`],
    locations: [city, 'Remote EU'],
    workFormats: ['remote', 'hybrid'],
    exclusions: [`BadCorp${tag}`],
  };
  const mine = (rows: { id: string }[]) =>
    rows.map((r) => Object.keys(ids).find((k) => ids[k] === r.id)).filter(Boolean);

  beforeAll(async () => {
    const [s] = await db.select({ id: source.id }).from(source).limit(1);
    if (!s) throw new Error('seed sources first');
    sourceId = s.id;
    const [u] = await db
      .insert(user)
      .values({ name: 'P', email: `p-${tag}@example.com` })
      .returning({ id: user.id });
    userId = (u as { id: string }).id;

    await job('title', { title: `${word} Developer` });
    await job('titleOld', {
      title: `${word} Developer II`,
      firstSeenAt: new Date(Date.now() - 3 * day),
    });
    await job('czech', { title: `Vývojář ${word}` });
    await job('descOnly', { title: 'Something else', description: `We use ${word} daily` });
    await job('otherCity', { title: `${word} Developer`, city: 'Elsewhere' });
    await job('nullCity', { title: `${word} Developer`, city: null });
    await job('remote', { title: `${word} Developer`, city: 'Elsewhere', workFormats: ['remote'] });
    await job('excluded', { title: `${word} Developer`, company: `BadCorp${tag} s.r.o.` });
    await job('expired', { title: `${word} Developer`, expiredAt: new Date() });
    await job('stale', {
      title: `${word} Developer`,
      lastSeenAt: new Date(Date.now() - 30 * day),
    });
    await job('shown', { title: `${word} Developer` });
    await job('unmatched', { title: 'Accountant' });

    await db.insert(opportunity).values({
      userId,
      type: 'job',
      jobPostingId: ids.shown as string,
      route: 'direct',
    });

    await event('soon');
    await event('far', { startsAt: new Date(Date.now() + 90 * day) });
    await event('past', { startsAt: new Date(Date.now() - day) });
    await event('cancelled', { cancelledAt: new Date() });
    await event('elsewhere', { city: 'Elsewhere' });
    await event('online', { city: null, online: true });
    await event('shown');
    await db.insert(opportunity).values({
      userId,
      type: 'event',
      eventListingId: eventIds.shown as string,
      route: 'event',
    });
  });

  afterAll(async () => {
    await db.delete(opportunity).where(eq(opportunity.userId, userId));
    await db.delete(jobPosting).where(inArray(jobPosting.id, Object.values(ids)));
    await db.delete(eventListing).where(inArray(eventListing.id, Object.values(eventIds)));
    await db.delete(user).where(eq(user.id, userId));
    await close();
  });

  const select = (limit = 25, t = targets) =>
    selectJobCandidates(db, { userId, targets: t, profile: { skills: [] }, limit });

  it('applies location, expiry, exclusion and already-shown rules', async () => {
    const rows = await select();
    const keys = mine(rows);
    expect(keys).toEqual(
      expect.arrayContaining(['title', 'titleOld', 'czech', 'descOnly', 'nullCity', 'remote']),
    );
    for (const gone of ['otherCity', 'excluded', 'expired', 'stale', 'shown', 'unmatched']) {
      expect(keys).not.toContain(gone);
    }
    expect(rows.every((r) => !r.topUp)).toBe(true);
  });

  it('orders title matches first, then newest', async () => {
    const keys = mine(await select());
    expect(keys.indexOf('title')).toBeLessThan(keys.indexOf('titleOld'));
    expect(keys.indexOf('titleOld')).toBeLessThan(keys.indexOf('descOnly'));
    expect(keys.at(-1)).toBe('descOnly');
  });

  it('respects the limit', async () => {
    expect(await select(2)).toHaveLength(2);
  });

  it('drops remote postings elsewhere when remote is not wanted', async () => {
    const keys = mine(await select(25, { ...targets, workFormats: ['onsite'], locations: [city] }));
    expect(keys).not.toContain('remote');
    expect(keys).toContain('title');
  });

  it('tops up with unmatched postings in the target city when few roles match', async () => {
    const rows = await select(25, { ...targets, roles: ['Astronaut'], locations: [city] });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.topUp)).toBe(true);
    const keys = mine(rows);
    expect(keys).not.toContain('nullCity');
    expect(keys).not.toContain('excluded');
    expect(keys).not.toContain('shown');
    expect(rows.length).toBeLessThanOrEqual(5);
  });

  it('selects upcoming events in the target city or online', async () => {
    const rows = await selectEventCandidates(db, { userId, targets });
    const keys = rows
      .map((r) => Object.keys(eventIds).find((k) => eventIds[k] === r.id))
      .filter(Boolean);
    expect(keys).toEqual(expect.arrayContaining(['soon', 'online']));
    for (const gone of ['far', 'past', 'cancelled', 'elsewhere', 'shown']) {
      expect(keys).not.toContain(gone);
    }
  });
});
