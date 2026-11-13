import { readFileSync } from 'node:fs';
import { workFormats } from '@job-pilot/shared/enums';
import { describe, expect, it } from 'vitest';
import { mapEventbrite } from './mappers/eventbrite.ts';
import { mapperFor } from './mappers/registry.ts';
import type { MappedJob } from './types.ts';

const PERSONAL_KEY = /email|phone|recruiter|ceoName|hosts|featuredGuests/i;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

const load = (key: string): Array<Record<string, unknown>> =>
  JSON.parse(readFileSync(new URL(`./fixtures/${key}.json`, import.meta.url), 'utf8'));

const personalKeys = (node: unknown, path = ''): string[] => {
  if (Array.isArray(node)) return node.flatMap((child, i) => personalKeys(child, `${path}[${i}]`));
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, child]) => [
      ...(PERSONAL_KEY.test(key) ? [`${path}.${key}`] : []),
      ...personalKeys(child, `${path}.${key}`),
    ]);
  }
  return [];
};

const jobKeys = [
  'jobs-cz',
  'prace-cz',
  'startupjobs-cz',
  'profesia-cz',
  'linkedin-cz',
  'indeed-cz',
];
const eventKeys = ['luma-prague', 'meetup-prague', 'eventbrite-cz'];

describe.each([...jobKeys, ...eventKeys])('mapper for %s', (key) => {
  const mapper = mapperFor(key);
  const items = load(key);

  it('is registered with the right kind', () => {
    expect(mapper?.kind).toBe(jobKeys.includes(key) ? 'job' : 'event');
  });

  it('maps every item, except foreign Profesia jobs', () => {
    for (const item of items) {
      const mapped = mapper?.map(item);
      if (mapped === null) {
        expect(key).toBe('profesia-cz');
        expect(item.country).not.toBe('CZ');
        continue;
      }
      expect(mapped?.url).toMatch(/^https?:\/\//);
      expect(mapped?.title).toBeTruthy();
      expect(mapped?.raw).toBeTruthy();
      expect(personalKeys(mapped?.raw)).toEqual([]);
      expect(JSON.stringify(mapped?.raw)).not.toMatch(EMAIL);
      expect(JSON.stringify(mapped)).not.toMatch(EMAIL);
    }
    expect(items.some((item) => mapper?.map(item) !== null)).toBe(true);
  });

  if (jobKeys.includes(key)) {
    it('fills job fields', () => {
      for (const item of items) {
        const job = mapper?.map(item);
        if (!job || !('company' in job)) continue;
        expect(job.company).toBeTruthy();
        expect(job.canonicalUrl).toBeTruthy();
        expect(job.externalId).toBeTruthy();
        expect(new Set(job.workFormats).size).toBe(job.workFormats?.length);
        for (const format of job.workFormats ?? []) expect(workFormats).toContain(format);
        expect(job.description?.length ?? 0).toBeLessThanOrEqual(20_000);
      }
    });
  } else {
    it('fills event fields', () => {
      for (const item of items) {
        const event = mapper?.map(item);
        if (!event || !('startsAt' in event)) continue;
        expect(event.startsAt).toBeInstanceOf(Date);
        expect(event.externalId).toBeTruthy();
        expect(typeof event.online).toBe('boolean');
      }
    });
  }
});

const mapJob = (key: string, item: unknown) =>
  mapperFor(key)?.map(item) as MappedJob | null | undefined;

describe('mapper details', () => {
  it('jobs-cz maps Praha and CZ', () => {
    const job = mapperFor('jobs-cz')?.map(load('jobs-cz')[0]);
    expect(job).toMatchObject({ city: 'Praha', region: 'Hlavní město Praha', country: 'CZ' });
  });

  it('prace-cz takes the id from the canonical url', () => {
    const job = mapperFor('prace-cz')?.map(load('prace-cz')[0]);
    expect(job?.externalId).toMatch(/^\d+$/);
  });

  it('startupjobs reads work formats', () => {
    const job = mapJob('startupjobs-cz', load('startupjobs-cz')[0]);
    expect(job?.workFormats).toContain('hybrid');
  });

  it('profesia drops non-CZ items and items without country', () => {
    const map = mapperFor('profesia-cz')?.map;
    expect(map?.({ ...load('profesia-cz')[0], country: 'NL' })).toBeNull();
    expect(map?.({ ...load('profesia-cz')[0], country: undefined })).toBeNull();
  });

  it('skips items without title or url', () => {
    expect(mapperFor('jobs-cz')?.map({ jobUrl: 'https://x.cz/1', companyName: 'A' })).toBeNull();
    expect(mapperFor('jobs-cz')?.map({ title: 'A', companyName: 'A' })).toBeNull();
    expect(mapperFor('jobs-cz')?.map('garbage')).toBeNull();
    expect(mapEventbrite({ name: 'x', eventUrl: 'https://x.cz' })).toBeNull();
  });

  it('indeed keeps the jk param in the canonical url', () => {
    const job = mapJob('indeed-cz', load('indeed-cz')[0]);
    expect(job?.canonicalUrl).toContain('jk=');
  });

  it('meetup drops the group organizer', () => {
    const event = mapperFor('meetup-prague')?.map(load('meetup-prague')[0]);
    expect(JSON.stringify(event?.raw)).not.toContain('organizerName');
  });

  it('unknown source has no mapper', () => {
    expect(mapperFor('nope')).toBeNull();
  });
});
