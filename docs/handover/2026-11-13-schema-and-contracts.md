# Handover: schema v1 + shared contracts (M0, [Both] items)

**From:** Artem · **To:** Daniil · **Date:** 2026-11-13 · **Branch:** `feat/schema-and-contracts`

The first two M0 items from `docs/todo.md` are done and need your review, because they are [Both]. Please check the
**"Needs your sign-off"** list first. Everything else is the plan from the todo, written down as code.

## What's in the branch

### `packages/shared` — contracts (zod 4)

No index files. Import by subpath: `@job-pilot/shared/<file>`.

| File | What |
| --- | --- |
| `enums.ts` | Every enum, as plain TS `as const` arrays (no zod). The DB enums are generated from these. v1 has no `person` type and no `connection` route. |
| `limits.ts` | Field limits from spec §1/§3, plus validation copy from spec §5, word for word (`messages`). |
| `errors.ts` | Error shape `{ error: { code, message, requestId, fields? } }`, code → HTTP status map, `formatErrorCode` → `JP-500-a1b2c3`. |
| `common.ts` | `idSchema` (uuid), `dateTimeSchema`, `tagListSchema` (trim, case-insensitive dedupe, min/max with spec messages), cursor pages, `undoableSchema`. |
| `profile.ts`, `targets.ts`, `schedule.ts`, `upload.ts`, `user.ts` | Onboarding / Profile and targets / settings DTOs, with defaults (`targetsDefaults`, `scheduleDefaults`). |
| `cv.ts` | **`cvContentSchema`** — the structured CV. PDF/DOCX are rendered from it, "Edit text" edits it, Compare diffs it. Your parse and CV-writing prompts should output this shape. |
| `opportunity.ts`, `pipeline.ts`, `draft.ts`, `agent-run.ts`, `chat.ts`, `push.ts` | Today, Pipeline, Review, run status, chat, push. |
| `routes.ts` | **API route map: 60 endpoints** with method, path, query/body/response schemas and `owner: 'artem' \| 'daniil'`. This is the contract to review. |

### `packages/db` — Drizzle 0.45 + postgres.js

- Schema in `src/schema/*.ts`, by area. TS columns are camelCase; DB columns are snake_case (`casing: 'snake_case'` in both the client and drizzle-kit).
- `src/client.ts`: `createDb(url)` → `{ db, close }`, with the full schema attached for relational queries. (Relations are not defined yet; add them when needed.)
- Migration `migrations/0000_init.sql`: **27 tables**. Scripts: `pnpm --filter @job-pilot/db db:generate | db:migrate | db:studio`.
- Tested by applying the migration to Postgres 17 (PGlite, because Docker wasn't running on my machine) plus constraint smoke tests. The docker-compose setup is my next item.

Tables relevant to you:

| Table | Notes |
| --- | --- |
| `source` | Your curated list: `key` (slug), `kind` job/event, `apifyActorId`, `inputTemplate` jsonb, `cron`, `enabled`, `notes` (ToS). |
| `source_run` | **New, not in the todo.** One row per Apify run: `apifyRunId` (unique), dataset id, status, item counts, `costUsd`. Feeds the webhook and the ops view. |
| `job_posting`, `event_listing` | Global ingestion. `dedupeKey` is unique (upsert target). `firstSeenAt`/`lastSeenAt`/`expiredAt`, normalized city/region/country, `workFormats[]`, `language`, `raw` jsonb. **No full-text index yet**: your M3 prefilter decides (tsvector vs trigram). |
| `agent_run` | `steps` jsonb `{ key, status }[]`. Partial unique index: **one queued/running run per user** (insert fails → return `agent_busy`). |
| `llm_usage` | **New, not in the todo.** One row per LLM call: task, model, promptVersion, tokens, duration, succeeded, optional userId/runId. |
| `opportunity` | Per-user card. Exactly one of `jobPostingId`/`eventListingId`, matching `type` (CHECK). Unique per (user, posting) and (user, event), so a user never sees the same item twice. Fit 0–100, why, gapNote, route + reason, feedStatus, skip reason/note. |
| `pipeline_item` | Created on Pursue (status `preparing`). 1:1 with opportunity. `nextFollowUpAt` is denormalized from the next pending follow-up. |
| `draft` | kind `cover_text \| form_answer \| follow_up \| event_prep`, label (form question), charLimit, position, `version` (optimistic locking), `editedByUserAt`. |
| `follow_up` | `sequence` 1 (+5 d) / 2 (+7 d after the first), status, linked draft. |
| `cv` | Master versions (unique per user + version) and special CVs (one per pipeline item, enforced). `content` = `CvContent`, `changes[]` = "What changed", `basedOnCvId`. |
| `upload` | Original file + `extractedText` + `parsedContent` (`CvContent`). Your parse job writes `parseStatus` and `parsedContent`, and pre-fills `profile`. |
| `activity` | Append-only log: status history, agent feedback (skips, edits), chat changes, and **Undo**. |
| `chat_thread`, `chat_message` | One thread per user. `toolCalls` jsonb (OpenAI format), `activityIds[]` for undoable changes. |

### Repo changes

- The Biome config moved to the repo root (`biome.json`), so it covers `apps/api` and `packages/*`. `apps/web` stays on Oxlint.
- `tsconfig.base.json`: `allowImportingTsExtensions` is on, so workspace packages are consumed as raw `.ts` (no build step). Node runs them via type stripping.
- `pnpm-workspace.yaml`: `allowBuilds: esbuild` (pnpm 11 blocks drizzle-kit's esbuild postinstall otherwise).

## Needs your sign-off

1. **Extra tables** `source_run` and `llm_usage` (above). Rename or reshape freely; the LLM layer and the ops view depend on them.
2. **Undo** = one generic `POST /v1/undo { undoToken }`. The token is an `activity.id`, valid until `activity.undoableUntil` (10 s). Undo replays `before` and sets `undoneAt`. I listed it under your name in `routes.ts` because skip / mark-sent / chat changes are yours. Happy to take it if you prefer.
3. **Chat**: one thread per user (the panel is the same on every screen). Screen + ids are sent as `context` with each message.
4. **Profile additions** (decided in the todo, shape is mine): salary = min/max + currency + month/year; notice period = `immediately | 2_weeks | 1_month | 2_months | 3_months | more`; languages = `{ language, level: basic | conversational | professional | native }`. These feed your form answers (salary, notice).
5. **`cvContentSchema`** (`shared/cv.ts`). Your parse and CV-writing prompts will output it, so check it covers what the model can reliably extract.
6. **Endpoint ownership** in `routes.ts`: each route says who builds it. Notable ones: `regenerateCv` is my endpoint but calls your jobs; `getPipelineItem` is mine but Review uses it.

## Gotchas

- **Better Auth** must use `advanced.database.generateId: 'uuid'`: all ids are uuid, including the auth tables.
- **Hono route order**: register `/v1/pipeline/stats` before `/v1/pipeline/:id`.
- **Enums**: change them only in `shared/enums.ts`, then run `db:generate`. Postgres enum changes need a migration.
- CHECK constraints in Postgres pass on NULL. Write new ones with explicit `is null` / `is not null` (the first draft of the weekly-schedule check had this bug).

## Next

- **Artem:** `packages/db` follow-up (docker-compose: Postgres + MinIO + Mailpit, seed script), then Better Auth, storage and the design system.
- **Daniil:** your M0 items are unblocked. `apps/worker` + pg-boss can use `createDb`, and the LLM layer can log to `llm_usage`. Please review the branch (mostly `routes.ts`, `cv.ts` and the tables above) and leave comments on the PR.
