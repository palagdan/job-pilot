import type { Db } from '../client.ts';
import { source } from '../schema/sources.ts';

type SourceSeed = typeof source.$inferInsert;

/**
 * Curated job and event sources. Research, verified test runs and field mappings: `docs/sources.md`.
 * `"{{maxItems}}"` in an input template is filled in by the ingestion job, which also passes the same
 * cap as the Apify `maxItems` run option so a run can never charge for more items.
 * Crons run in Europe/Prague.
 */
export const sourceSeeds: SourceSeed[] = [
  // ---------- Jobs ----------
  {
    key: 'mpsv-urad-prace',
    name: 'Úřad práce ČR (MPSV open data)',
    kind: 'job',
    baseUrl: 'https://data.mpsv.cz/web/data/volna-mista',
    provider: 'mpsv_open_data',
    apifyActorId: null,
    inputTemplate: {
      url: 'https://data.mpsv.cz/od/soubory/volna-mista/volna-mista.json',
      changedSince: '{{lastRunAt}}',
    },
    // The file is regenerated nightly around 23:00.
    cron: '30 2 * * *',
    enabled: true,
    notes:
      'Free open data, ~40k vacancies, ~186 MB JSON: stream-parse, import by datumZmeny. ' +
      'Descriptions contain contact names/emails/phones: strip them, never store raw unfiltered (GDPR). ' +
      'urlAdresa is null in most records; city is a code-list id (Obec/<id>).',
  },
  {
    key: 'jobs-cz',
    name: 'Jobs.cz',
    kind: 'job',
    baseUrl: 'https://www.jobs.cz',
    provider: 'apify',
    apifyActorId: 'memo23/jobscz-scraper',
    inputTemplate: {
      // The root /prace/ listing yields 0 items; city listings work (praha, brno verified).
      startUrls: ['https://www.jobs.cz/prace/praha/', 'https://www.jobs.cz/prace/brno/'],
      postedWithinHours: 48,
      maxItems: '{{maxItems}}',
      enrichEmails: false,
      proxy: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'], apifyProxyCountry: 'CZ' },
    },
    cron: '0 6 * * *',
    enabled: true,
    notes:
      'Largest CZ board (Alma Career, same group as Prace.cz). No public API; robots.txt disallows /api/ only. ' +
      'Not authorised scraping: link to the original ad, show excerpts only. ' +
      'postedDate is often null: use first_seen_at. Ignore companyEmail/companyPhone/applyEmail. ' +
      'Residential proxy traffic is billed on top of ~$0.5/1k items.',
  },
  {
    key: 'prace-cz',
    name: 'Prace.cz',
    kind: 'job',
    baseUrl: 'https://www.prace.cz',
    provider: 'apify',
    apifyActorId: 'blackfalcondata/prace-scraper',
    inputTemplate: {
      startUrls: ['https://www.prace.cz/nabidky/'],
      maxAgeMinutes: 2880,
      includeDetails: true,
      maxResults: '{{maxItems}}',
      maxPages: 30,
      descriptionFormat: 'text',
    },
    cron: '0 7 * * *',
    enabled: true,
    notes:
      'Alma Career (shares inventory with Jobs.cz: canonicalUrl can be a jobs.cz domain, dedupe across sources). ' +
      'robots.txt disallows /hledat/. postedAt can be null. Drop extractedEmails/extractedPhones. ~$1.1/1k.',
  },
  {
    key: 'startupjobs-cz',
    name: 'StartupJobs.cz',
    kind: 'job',
    baseUrl: 'https://www.startupjobs.cz',
    provider: 'apify',
    apifyActorId: 'tsutseisoftware/startupjobs-scraper',
    inputTemplate: { maxItems: '{{maxItems}}', includeDetails: true, postedWithinDays: 3 },
    cron: '0 8 * * *',
    enabled: true,
    notes:
      'IT/startup roles, ~400 live jobs; robots.txt allows crawling. Has workArrangement, seniority, technologies. ' +
      'No public feed of all offers; ask support@startupjobs.com for a partner feed. New actor author: keep an eye on it. ~$1.45/1k.',
  },
  {
    key: 'profesia-cz',
    name: 'Profesia.cz',
    kind: 'job',
    baseUrl: 'https://www.profesia.cz',
    provider: 'apify',
    apifyActorId: 'tsutseisoftware/profesia-scraper',
    inputTemplate: {
      country: 'cz',
      postedWithinDays: 2,
      includeDetails: true,
      maxItems: '{{maxItems}}',
      sortBy: 'newest',
      proxyConfiguration: {
        useApifyProxy: true,
        apifyProxyGroups: ['RESIDENTIAL'],
        apifyProxyCountry: 'CZ',
      },
    },
    cron: '0 9 * * *',
    enabled: true,
    notes:
      'Returns foreign postings (e.g. Netherlands) and partly Slovak text: keep country = CZ only. ' +
      'postedWithinDays is unreliable: filter on postedAt ourselves. Needs residential proxy. ~$1.3/1k.',
  },
  {
    key: 'linkedin-cz',
    name: 'LinkedIn Jobs (Czechia)',
    kind: 'job',
    baseUrl: 'https://www.linkedin.com/jobs',
    provider: 'apify',
    apifyActorId: 'valig/linkedin-jobs-scraper',
    inputTemplate: {
      keywords: '',
      location: 'Czechia',
      datePosted: 'r86400',
      limit: '{{maxItems}}',
    },
    cron: '0 10 * * *',
    enabled: false,
    notes:
      'DISABLED: LinkedIn User Agreement prohibits scraping; history of litigation against scrapers. ' +
      'Output has recruiterName/recruiterUrl (personal data). Max 1000 results per search. ' +
      'Input verified with keywords "developer"; empty keywords untested. Enable only after accepting the risk.',
  },
  {
    key: 'indeed-cz',
    name: 'Indeed (cz.indeed.com)',
    kind: 'job',
    baseUrl: 'https://cz.indeed.com',
    provider: 'apify',
    apifyActorId: 'valig/indeed-jobs-scraper',
    inputTemplate: {
      country: 'cz',
      title: '',
      location: 'Česko',
      datePosted: '1',
      limit: '{{maxItems}}',
    },
    cron: '0 10 * * *',
    enabled: false,
    notes:
      'DISABLED: Indeed ToS prohibit scraping. Output has employer.ceoName (personal data). ' +
      'Input verified with title "developer", location "Praha"; empty title untested. ~$0.1/1k.',
  },

  // ---------- Events ----------
  {
    key: 'luma-prague',
    name: 'Luma: Prague',
    kind: 'event',
    baseUrl: 'https://luma.com/prague',
    provider: 'apify',
    apifyActorId: 'solidcode/luma-scraper',
    inputTemplate: {
      discoverCity: 'prague',
      category: 'all',
      eventType: 'all',
      scrapeEventDetails: true,
      maxResults: '{{maxItems}}',
    },
    cron: '0 5 * * *',
    enabled: true,
    notes:
      'Public discover page, tech/AI/startup communities but also nightlife: needs a relevance filter. ' +
      'Do not store hosts/featuredGuests (personal names). ~$3/1k.',
  },
  {
    key: 'meetup-prague',
    name: 'Meetup: Prague',
    kind: 'event',
    baseUrl: 'https://www.meetup.com/find/?location=cz--Prague',
    provider: 'apify',
    apifyActorId: 'filip_cicvarek/meetup-scraper',
    inputTemplate: {
      mode: 'events',
      city: 'Prague',
      country: 'cz',
      searchKeyword: 'tech',
      radius: 30,
      sortBy: 'DATETIME',
      maxResults: '{{maxItems}}',
    },
    cron: '15 5 * * *',
    enabled: true,
    notes:
      'Best CZ coverage, ~$1/1k. Meetup terms restrict scraping: store minimal public fields, link out, ' +
      'never hosts/members/RSVPs. searchKeyword is loose: needs a relevance filter.',
  },
  {
    key: 'meetup-brno',
    name: 'Meetup: Brno',
    kind: 'event',
    baseUrl: 'https://www.meetup.com/find/?location=cz--Brno',
    provider: 'apify',
    apifyActorId: 'filip_cicvarek/meetup-scraper',
    inputTemplate: {
      mode: 'events',
      city: 'Brno',
      country: 'cz',
      searchKeyword: 'tech',
      radius: 25,
      sortBy: 'DATETIME',
      maxResults: '{{maxItems}}',
    },
    cron: '20 5 * * *',
    enabled: true,
    notes: 'Same actor and input shape as meetup-prague (Prague verified; Brno not test-run yet).',
  },
  {
    key: 'eventbrite-cz',
    name: 'Eventbrite: Prague tech',
    kind: 'event',
    baseUrl: 'https://www.eventbrite.com/d/czech-republic--praha/tech/',
    provider: 'apify',
    apifyActorId: 'memo23/eventbrite-scraper',
    inputTemplate: {
      // Must be plain strings: {url} objects silently yield 0 items and still charge the start fee.
      startUrls: ['https://www.eventbrite.com/d/czech-republic--praha/tech/'],
      enrichOrganizer: false,
      harvestOrganizerEmails: false,
      maxItems: '{{maxItems}}',
    },
    cron: '30 5 * * *',
    enabled: true,
    notes:
      'Business/career events Meetup lacks. Eventbrite ToS prohibit scraping: public fields + link only. ' +
      'Keep organizer enrichment and email harvesting off (GDPR). ~$1/1k + $0.025 start; high timeout rate.',
  },
];

/** Upserts the curated sources by `key`. The list above is the source of truth, including `enabled`. */
export const seedSources = async (db: Db) => {
  for (const row of sourceSeeds) {
    const { key, ...rest } = row;
    await db
      .insert(source)
      .values(row)
      .onConflictDoUpdate({ target: source.key, set: { ...rest, updatedAt: new Date() } });
  }
  return sourceSeeds.length;
};
