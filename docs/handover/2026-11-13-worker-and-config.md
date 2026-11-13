# Handover: background worker + env validation (M0, Daniil)

**From:** Daniil · **To:** Artem · **Date:** 2026-11-13 · **Branch:** `feat/worker-pg-boss`

The M0 item `apps/worker with pg-boss; env validation (packages/config, zod) + .env.example` is done. Please check
**"Needs your sign-off"**, especially the job list, because your upload, Pursue and email work enqueues these jobs.

## What's in the branch

### `packages/config`: env validation

| File | What |
| --- | --- |
| `env.ts` | `parseEnv(shape, source = process.env)`: zod-validates once at startup. On failure it prints `Invalid environment: <VAR>: <message>` per issue and exits 1. Returns a frozen, typed object. |
| `fragments.ts` | Shapes to spread: `baseEnv` (`NODE_ENV`, `LOG_LEVEL`) and `databaseEnv` (`DATABASE_URL`). Add `authEnv`, `featherlessEnv`, `apifyEnv` and so on here as features land. |

Each app has its own `src/env.ts`, e.g. `parseEnv({ ...baseEnv, ...databaseEnv, WORKER_CONCURRENCY: … })`. Read env only through that object, never `process.env` directly.

### `packages/jobs`: job contract + typed pg-boss client (used by api **and** worker)

- **pg-boss 12** in its own Postgres schema `pgboss`, in the same database. pg-boss creates and migrates that schema itself, so there's no Drizzle migration.
- `definitions.ts`: every job, with a zod payload, retry/expiry options and a note on who enqueues and who handles it:

| Job | Payload | Enqueued by | Handled by |
| --- | --- | --- | --- |
| `cv.parse` | `{ uploadId }` | api upload endpoint (Artem) | worker (Daniil) |
| `cv.generate-master` | `{ userId, uploadId? }` | api after onboarding / regenerate (Artem) | worker (Daniil) |
| `agent.run` | `{ runId }` | api "Run now" + `scheduler.tick` (Daniil) | worker (Daniil) |
| `scheduler.tick` | `{}` | worker cron (Daniil) | worker (Daniil) |
| `apify.ingest-dataset` | `{ sourceRunId }` | api Apify webhook (Daniil) | worker (Daniil) |
| `pack.prepare` | `{ pipelineItemId }` | api Pursue endpoint (Artem) | worker (Daniil) |
| `follow-up.check` | `{}` | worker cron (Daniil) | worker (Daniil) |
| `email.send` | `{ template, userId, dedupeKey, data }` | api + worker (both) | worker (Artem) |

- `client.ts`: `createJobQueue({ connectionString })` returns `start()`, `send(name, payload)`, `work(name, handler, { batchSize, concurrency })`, `schedule(name, cron, payload, { tz })`, `stop()` and `onError()`.
  - `send` validates the payload before touching the DB and returns the job id, or `null` when deduplicated.
  - `work` validates each job's data again before calling the handler.
  - `concurrency` maps to pg-boss `localConcurrency`.

Enqueue from the api (example for your upload endpoint):

```ts
const queue = createJobQueue({ connectionString: env.DATABASE_URL });
await queue.start(); // once at boot
await queue.send('cv.parse', { uploadId: upload.id });
```

### `apps/worker`

- `src/main.ts`: env → `createDb` → `createJobQueue` → `start()` (creates all 8 queues) → `registerHandlers` → `worker ready`. SIGINT/SIGTERM triggers a graceful stop of the queue and then closes the DB.
- `src/handlers/register.ts`: the single place that maps job → handler. It registers **nothing yet**; each job arrives with its own task, as one file in `src/handlers/`.
- `src/log.ts`: a tiny JSON-lines logger with the same `debug/info/warn/error(msg, fields)` shape, as a placeholder. Replace it with your pino logger when that lands (move it to a shared package so api and worker both use it).
- Run: `pnpm --filter @job-pilot/worker dev`. No build step; Node runs the `.ts` directly.

### Other changes

- `apps/api`: `src/env.ts` (`PORT`, base env); `main.ts` uses it.
- `.env.example` at the repo root. Copy it to `.env`. The api and worker load it via `node --env-file-if-exists=../../.env` (no dotenv). Upcoming keys are listed commented out, with owners.
- `turbo.json` + root `package.json`: a `test` task (Vitest 5).

## Tested

- `packages/config`: 3 unit tests (parse, defaults, missing var → exit 1 with the var name).
- `packages/jobs`: invalid payload rejected without DB, plus an integration test (send → work → typed payload) that runs when `TEST_DATABASE_URL` is set. **Passed on real Postgres 17**, via the `embedded-postgres` npm package because there's no Docker here.
- Worker started against that Postgres, created 8 queues, stopped cleanly on SIGTERM (exit 0). Without `DATABASE_URL` it exits 1 with `Invalid environment: DATABASE_URL`.
- Your `0000_init.sql` migration also applies cleanly on Postgres 17 (`drizzle-kit migrate`).

## Needs your sign-off

1. **Job names and payloads** (table above), especially the ones you enqueue: `cv.parse`, `cv.generate-master`, `pack.prepare`, `email.send`. Retry/expiry values are first guesses.
2. **pg-boss lives in the `pgboss` schema of the app database.** Exclude it from anything Drizzle manages; `drizzle-kit` only touches `public`.
3. **`.env` at the repo root**, loaded with `--env-file-if-exists`. Your docker-compose should match `DATABASE_URL=postgres://jobpilot:jobpilot@localhost:5432/jobpilot`.
4. **`email.send` handler is yours**: it lives in the worker (`src/handlers/send-email.ts`), registered in `register.ts`.

## Gotchas

- pg-boss throws if an option is passed as `undefined` (e.g. `batchSize: undefined`). `client.ts` always passes numbers, so keep it that way if you add options.
- A handler that throws fails the job, and pg-boss retries it per the queue options. Invalid payload data also throws.
- A queue in a shared test DB can hold jobs left over from earlier runs. Tests must only wait for their own job (see `client.test.ts`).
- Turbo needs a `pnpm` binary on PATH. If only corepack is installed, run `corepack enable`.

## Next

- **Daniil:** CI (lint, typecheck, test, integration tests against a Postgres service), then the Featherless LLM layer (logs to `llm_usage`).
- **Artem:** docker-compose + seed, Better Auth, storage. Use `parseEnv` + `fragments.ts` for their env vars.
