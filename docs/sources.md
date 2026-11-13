# Job and event sources (v1)

Research and test runs: 2026-11-13. The seed is in `packages/db/src/seed/sources.ts` (`pnpm --filter @job-pilot/db db:seed`, which also seeds the demo user).
Every Apify actor below was **test-run with 5 items** on our account (total spend ≈ $0.14), except where marked.

## Decisions

- **Ingestion is global**, not per user. Each source runs on its own cron (Europe/Prague) and writes to `job_posting` / `event_listing`, and each user's agent run ranks from there.
- **LinkedIn and Indeed are seeded but disabled.** Their terms prohibit scraping (LinkedIn has sued scrapers) and the output has personal data. They can be turned on later by flipping `enabled`.
- **MPSV (Úřad práce) open data** is a free, legal nightly JSON file, so it needs no Apify. `source.provider` is `apify | mpsv_open_data`, and `apify_actor_id` is required only for Apify (CHECK constraint).
- **Cost:** about **$60–120/month** for the enabled set, mostly Jobs.cz volume plus residential proxy traffic. Our Apify account is on the **free plan ($5/month credit)**, so we must upgrade before daily ingestion goes live.
- Never store personal data from the scraped items: emails, phones, hosts, recruiters, CEO names. Show excerpts and link to the original posting.

## Jobs

| Key | Source | Actor (fallback) | Status | ~Cost | Cron |
| --- | --- | --- | --- | --- | --- |
| `mpsv-urad-prace` | Úřad práce ČR, ~40k vacancies | none: direct JSON | ✅ sample read | free | 02:30 |
| `jobs-cz` | Jobs.cz (largest board) | `memo23/jobscz-scraper` (`shahidirfan/Jobs-cz-Scraper`) | ✅ 5/5 | $0.5/1k + proxy | 06:00 |
| `prace-cz` | Prace.cz | `blackfalcondata/prace-scraper` (`shahidirfan/Prace-cz-Jobs-Scraper`) | ✅ 5/5 | $1.1/1k | 07:00 |
| `startupjobs-cz` | StartupJobs.cz (IT, ~400 jobs) | `tsutseisoftware/startupjobs-scraper` (`studio-amba/startupjobs-cz-scraper`) | ✅ 5/5 | $1.45/1k | 08:00 |
| `profesia-cz` | Profesia.cz | `tsutseisoftware/profesia-scraper` (`blackfalcondata/profesia-scraper`) | ✅ 5/5 | $1.3/1k + proxy | 09:00 |
| `linkedin-cz` | LinkedIn Jobs, Czechia | `valig/linkedin-jobs-scraper` (`curious_coder/linkedin-jobs-scraper`) | ✅ input only, **disabled** | $0.4/1k | — |
| `indeed-cz` | cz.indeed.com | `valig/indeed-jobs-scraper` | ✅ input only, **disabled** | $0.1/1k | — |

Considered and skipped for v1:

- **JenPráce:** mostly duplicates Úřad práce and the other portals.
- **Welcome to the Jungle CZ:** small Czech volume; not test-run.
- **Jobstack.it:** small, no actor; it has a sitemap if we want it later.
- **`tsutseisoftware/czech-jobs-aggregator`:** one actor for Jobs.cz, Prace.cz, Úřad práce and more, with cross-portal dedupe. It is brand new (created 2026-11), so it is worth a test later but shouldn't be a single dependency.

### Field mapping to `job_posting` (non-obvious fields)

| Source | externalId | url | company | description | location | workFormats | salaryRaw | postedAt |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mpsv | `portalId` | none (`urlAdresa` null in ~95% of records): link to the dataset | `zamestnavatel.nazev` | `upresnujiciInformace.cs` (**strip contacts**) | `mistoVykonuPrace.pracoviste[].adresa`, ids need the MPSV code lists | onsite | `mesicniMzdaOd/Do` | `datumVlozeni` |
| jobs-cz | `jobId` | `jobUrl` | `companyName` | `descriptionText` | `location` (free text; `addressLocality` often null) | `remote` (bool) | `salaryRaw` (+ `salary.{min,max,currency}`) | **often null** → `first_seen_at` |
| prace-cz | id in `canonicalUrl` (`jobId` is a hash) | `canonicalUrl` (may be a jobs.cz domain) | `company` | `descriptionText` | `location`, `region` slug, `district` | none | `salaryText` | `postedAt` (can be null) |
| startupjobs-cz | `jobId` | `url` | `company` | `description` | `location`, `region`, `country` | `workArrangement`, `remote`, `workModes[]` | build from `salaryMin/Max/Currency/Period` | `postedAt` |
| profesia-cz | `jobId` | `url` | `company` | `description` (partly Slovak) | `location`, `region`, `country` — **filter country = CZ** | `workArrangement` | `salaryText` | `postedAt` (date only) |
| linkedin-cz | `id` | `url` | `companyName` | `description` | `location` free text | none reliable | `salary` (usually empty) | `postedDate` |
| indeed-cz | `key` | `url` | `employer.name` | `description.text` | `location.city`, `admin1Code` | none | `baseSalary.*` | `datePublished` |

### Gotchas found in test runs

- **Actor `startUrls` must be plain strings.** The `{url}` object form silently returns 0 items, and Eventbrite still charged its start fee.
- **Jobs.cz:** the root `/prace/` listing returns 0 items. City listings work (`/prace/praha/`, `/prace/brno/` verified). Add more cities after a test run.
- **Profesia:** `country: "cz"` still returns foreign jobs (e.g. Netherlands), and `postedWithinDays` doesn't really filter. Filter on country and `postedAt` ourselves.
- **Prace.cz and Jobs.cz share inventory** (both Alma Career), so the same job appears twice. Dedupe across sources on normalised title + company + city, not only the URL.
- `extractedEmails`/`extractedPhones` (Prace.cz), `companyEmail`/`companyPhone`/`applyEmail` (Jobs.cz), `recruiterName` (LinkedIn) and `employer.ceoName` (Indeed) must be dropped in the mappers.

## Events

| Key | Source | Actor (fallback) | Status | ~Cost | Cron |
| --- | --- | --- | --- | --- | --- |
| `luma-prague` | Luma, Prague discover | `solidcode/luma-scraper` (`aitorsm/luma-events`) | ✅ 5/5 | $3/1k | 05:00 |
| `meetup-prague` | Meetup, Prague, 30 mi | `filip_cicvarek/meetup-scraper` (`deriverge/meetup-scraper`) | ✅ 5/5 | $1/1k | 05:15 |
| `meetup-brno` | Meetup, Brno, 25 mi | same | same input shape, not run | $1/1k | 05:20 |
| `eventbrite-cz` | Eventbrite, Prague tech | `memo23/eventbrite-scraper` (`aitorsm/eventbrite`, 20× pricier) | ✅ 5/5 | $1/1k + $0.025/run | 05:30 |

Later or by arrangement:

- **techmeetups.cz:** the best Czech tech-event aggregator, but `robots.txt` disallows its `/api/`. Ask the owner for a feed instead of scraping.
- **Luma community calendars:** `luma.com/brno`, `luma.com/techmeetupostrava`, `luma.com/productboardprg`. The actor accepts `lumaUrls` (not test-run yet).
- **JIC Brno** (`jic.cz/cz/akce`): its pages carry JSON-LD, so a small custom actor would work (v2).
- **Czechitas, CzechInvest, career fairs:** no feed found; they would each need a custom actor or a curated list.
- **Skipped:** GoOut (culture), StartupJobs (no events), Impact Hub, Node5.

### Field mapping to `event_listing`

| Source | externalId | url | title | organizer | startsAt / endsAt | venue / city | online |
| --- | --- | --- | --- | --- | --- | --- | --- |
| luma | `eventId` | `eventUrl` | `name` | `organizer.name` | `startAt`/`endAt` (UTC) | `location.name`+`address` / `location.city` (needs normalising, e.g. "Hlavní město Praha") | `location.isVirtual` |
| meetup | `eventId` | `eventUrl` | `eventName` | `group.name` | `startDateTime`/`endDateTime` (with offset) | `venue.name`+`address` / `venue.city` | `isOnline` |
| eventbrite | `eventId` | `eventUrl` | `name` | `organizerName` | `startDate`/`endDate` (with offset) | `venueName` / `addressLocality` | `isOnline` |

**Relevance:** Luma Prague includes nightlife, and Meetup's `searchKeyword` is loose (a language club showed up for "tech"). The ingestion or ranking step needs a career/tech relevance filter.

Test samples (5 items each) are in `.cache/apify-samples/` (gitignored) for writing the mappers.
