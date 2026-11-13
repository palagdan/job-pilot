# Handover: ingestion (M1/M2, Daniil)

**From:** Daniil · **To:** Artem · **Date:** 2026-11-13

Scraped data now lands in `job_posting` / `event_listing`. The chain is: scheduled `source.run` → Apify → `apify.poll-runs` → `apify.ingest-dataset` → rows.

## What's in (`apps/worker/src/ingest/`)

- **One mapper per source:** jobs-cz, prace-cz, startupjobs-cz, profesia-cz, linkedin-cz, indeed-cz, luma, meetup, eventbrite (registry: `mappers/registry.ts`). Items are untrusted, so they are read with safe accessors and incomplete items are skipped.
- **Personal data is dropped** (`scrub.ts`): emails, phones, recruiters, CEO names, hosts and organizer socials are removed from `raw` at any depth. Emails and phone numbers inside text become `[removed]`.
- **Normalisation** (`normalize.ts`):
  - city + kraj for the main Czech cities ("Praha – Krč", "Hlavní město Praha" and "Prague" all become Praha)
  - language cs/sk/en heuristic
  - remote/hybrid/onsite
  - canonical URLs
- **Cross-source dedupe:** a job's key is a hash of normalised title + company (legal suffixes dropped) + city; an event's is title + date + city. The first source wins; re-seen items only refresh `last_seen_at` (and fill an empty description or salary).
- **Expiry:** a daily `ingest.expire` job (03:00) marks jobs not seen for 7 days as expired. A job that appears again is re-activated.

## For your screens

- **Today items** read from `job_posting` (city in Czech, `work_formats`, `posted_at` may be null, so use `first_seen_at`) and `event_listing` (`online`, `cancelled_at`).
- **Luma Prague is noisy** (raves, dance, theatre in the live data). Ranking or a relevance filter must handle it; ingestion keeps everything.

## Tested

- 80 worker tests: normalisation 30, mappers 35 on committed sanitized fixtures, and 5 on the real DB (idempotent re-ingest, same job from two sources = one row, events).
- **Live:** the real Luma Prague dataset (3 items) was ingested into the local DB as 3 Praha events.
- The expiry job has no test of its own.

## Also

`biome.json` now ignores `**/.cache` (scratch scripts there broke lint).
