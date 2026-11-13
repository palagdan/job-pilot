import { describe, expect, it } from 'vitest';
import {
  canonicalUrl,
  dedupeKeyForEvent,
  dedupeKeyForJob,
  detectLanguage,
  normalizeCity,
  stripHtml,
  truncate,
} from './normalize.ts';

describe('normalizeCity', () => {
  it.each([
    'Praha 5',
    'Praha – Krč',
    'Praha-Ruzyně',
    'Hlavní město Praha',
    'Prague',
    'Prag',
    'Sulická 1597/48, Praha – Krč',
    'Na Florenci 2116/15, 110 00 Praha 1',
  ])('maps %s to Praha', (raw) => {
    expect(normalizeCity(raw)).toEqual({
      city: 'Praha',
      region: 'Hlavní město Praha',
      isCzech: true,
    });
  });

  it.each([
    ['Brno-město', 'Brno', 'Jihomoravský kraj'],
    ['Brno, South Moravia, Czechia', 'Brno', 'Jihomoravský kraj'],
    ['Ostrava', 'Ostrava', 'Moravskoslezský kraj'],
    ['Plzen', 'Plzeň', 'Plzeňský kraj'],
    ['Hradec Králové', 'Hradec Králové', 'Královéhradecký kraj'],
    ['Ústí nad Labem', 'Ústí nad Labem', 'Ústecký kraj'],
    ['České Budějovice', 'České Budějovice', 'Jihočeský kraj'],
    ['Jihlava', 'Jihlava', 'Kraj Vysočina'],
  ])('maps %s', (raw, city, region) => {
    expect(normalizeCity(raw)).toMatchObject({ city, region });
  });

  it('keeps unknown cities as a trimmed first segment', () => {
    expect(normalizeCity('  Dolní Břežany , Středočeský kraj')).toEqual({
      city: 'Dolní Břežany',
      region: null,
      isCzech: false,
    });
  });

  it('returns nothing for empty input', () => {
    expect(normalizeCity(null)).toEqual({ city: null, region: null, isCzech: false });
    expect(normalizeCity('  ')).toEqual({ city: null, region: null, isCzech: false });
  });
});

describe('detectLanguage', () => {
  it('detects Czech', () => {
    expect(
      detectLanguage('Hledáme zkušeného vývojáře, který se bude podílet na vývoji naší aplikace.'),
    ).toBe('cs');
  });
  it('detects Slovak', () => {
    expect(
      detectLanguage(
        'Hľadáme skúseného vývojára, ktorý sa bude podieľať na vývoji našej aplikácie.',
      ),
    ).toBe('sk');
  });
  it('detects English', () => {
    expect(
      detectLanguage('We are looking for an engineer who will work with our team on the platform.'),
    ).toBe('en');
  });
  it('returns null for short or empty text', () => {
    expect(detectLanguage('')).toBeNull();
    expect(detectLanguage(null)).toBeNull();
    expect(detectLanguage('Hello world')).toBeNull();
  });
});

describe('dedupe keys', () => {
  const base = { title: 'Vývojář Node.js', company: 'Acme s.r.o.', city: 'Praha' };

  it('is stable across diacritics, suffixes, case and whitespace', () => {
    const key = dedupeKeyForJob(base);
    expect(key).toMatch(/^job:[0-9a-f]{64}$/);
    expect(
      dedupeKeyForJob({
        title: '  vyvojar   NODE.JS ',
        company: 'ACME, spol. s r.o.',
        city: 'Praha',
      }),
    ).toBe(key);
    expect(dedupeKeyForJob({ ...base, company: 'Acme a.s.' })).toBe(key);
  });

  it('differs for different jobs', () => {
    expect(dedupeKeyForJob({ ...base, city: 'Brno' })).not.toBe(dedupeKeyForJob(base));
    expect(dedupeKeyForJob({ ...base, title: 'Tester' })).not.toBe(dedupeKeyForJob(base));
  });

  it('event key uses title, start date and city', () => {
    const key = dedupeKeyForEvent({
      title: 'Meetup Příští',
      startsAt: new Date('2026-11-20T18:00:00Z'),
      city: 'Praha',
    });
    expect(key).toMatch(/^event:/);
    expect(
      dedupeKeyForEvent({
        title: ' meetup  pristi ',
        startsAt: new Date('2026-11-20T09:00:00Z'),
        city: 'praha',
      }),
    ).toBe(key);
    expect(
      dedupeKeyForEvent({
        title: 'Meetup Příští',
        startsAt: new Date('2026-11-21T18:00:00Z'),
        city: 'Praha',
      }),
    ).not.toBe(key);
  });
});

describe('canonicalUrl', () => {
  it('drops query, fragment and trailing slash and lowercases the host', () => {
    expect(canonicalUrl('https://WWW.Jobs.cz/rpd/123/?utm=x#top')).toBe(
      'https://www.jobs.cz/rpd/123',
    );
  });
  it('keeps the Indeed jk param', () => {
    expect(canonicalUrl('https://cz.indeed.com/viewjob?jk=abc123&from=serp')).toBe(
      'https://cz.indeed.com/viewjob?jk=abc123',
    );
  });
  it('returns invalid urls trimmed', () => {
    expect(canonicalUrl(' not a url ')).toBe('not a url');
  });
});

describe('text helpers', () => {
  it('strips html and decodes entities', () => {
    expect(stripHtml('<p>Hello&nbsp;&amp; <b>bye</b></p><ul><li>a</li><li>b</li></ul>')).toBe(
      'Hello & bye\n- a\n- b',
    );
  });
  it('truncates long text', () => {
    expect(truncate('x'.repeat(25_000))).toHaveLength(20_000);
    expect(truncate('short')).toBe('short');
  });
});
