# Handover: Apify client service (M1, Daniil)

**From:** Daniil · **To:** Artem · **Date:** 2026-11-13

Scraping now runs on its own schedule. Ingestion (dataset → `job_posting` / `event_listing`) is the next task.

## What's in

- **`packages/apify`:** a `fetch`-based client: `startRun`, `getRun`, `getDatasetItems`, `getDatasetItemCount`. It also has `fillInputTemplate` (`"{{maxItems}}"` becomes the number) and Apify status → `source_run.status` mapping.
- **Jobs:**
  - `source.run { sourceId }` starts an Apify run, capped by `APIFY_MAX_ITEMS` (200) and `APIFY_MAX_CHARGE_USD` ($1), and inserts a `source_run`. It skips disabled and non-Apify sources, and skips a source that already has a run going.
  - `apify.poll-runs` runs every minute: finished runs get status, item count and cost; succeeded runs enqueue `apify.ingest-dataset { sourceRunId }` (**no handler yet**); runs stuck for over 2 h become `timed_out`.
- **Schedules:** at worker start, every enabled Apify source gets its own `source.run` schedule (pg-boss `key` = source key, cron from the seed, Europe/Prague). Sources that were removed or disabled are unscheduled.
- **Demo command:** `pnpm --filter @job-pilot/worker source:run <key>` (e.g. `jobs-cz`) starts a source now; the running worker picks it up.
- `packages/jobs` client: `schedule(..., { key })`, `unschedule`, `scheduleKeys`.

## Webhook: not built (on purpose)

`POST /webhooks/apify` needs the api to be publicly reachable. Locally the poller does the same job within a minute. Add the webhook when we deploy (`APIFY_WEBHOOK_SECRET` is in `.env.example`, commented out).

## Env (worker)

`APIFY_TOKEN`, `APIFY_MAX_ITEMS=200`, `APIFY_MAX_CHARGE_USD=1`.

## Tested

- **Live:** a `luma-prague` run (3 items) went `running → succeeded` in 5 s, cost $0.0001, and ingestion was enqueued.
- **Worker boot:** the worker started with the real pg-boss queue and registered 8 source schedules plus the poller, with the correct crons and timezone.
- **Automated tests:** apify 15, worker 10 (real DB: overlap skip, disabled skip, error rethrow, succeeded/failed/stale, per-run isolation).
