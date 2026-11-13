# JobPilot v1 — todo list (2 developers)

## Context

Full feature breakdown (from the Figma file "HKT"): `docs/feature-list.md`. Decisions made for v1:

- Brand v2 "JobPilot Blue" is final; logo = **02 Compass**.
- Jobs come from **Apify** scrapers over a curated list of **Czech job sites**; events from **Luma** + other event sites, also via Apify.
- **People discovery is cut** from v1 → the **Connection route is cut too** (it depended on people). Routes in v1: auto / direct / event.
- LLM = **Featherless AI** (existing subscription; OpenAI-compatible API, open-weight models).
- **Out of scope:** billing, hosting/deploy, mobile/responsive, Terms/Privacy/GDPR (data export, legal pages).

Repo today: Turborepo + pnpm, `apps/web` (Next 16, React 19, Oxlint, React Compiler), `apps/api` (Hono, Biome), TS 7. Nothing else.

## How we split the work

Split **by area**. Each owner builds their area **end to end — backend, worker and screens** — so every feature is usable in the browser as soon as it is done.

|          | **Daniil — agent side**                                                                                                                                        | **Artem — account side**                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Backend  | Featherless LLM layer, Apify sources + ingestion, scheduler + runs, ranking, CV parse + master/special CV writing, application packs, drafts, follow-ups, chat | Monorepo infra, DB, auth, storage, upload, profile/targets/schedule, CV files (PDF/DOCX), emails, Pipeline, settings, push |
| Frontend | Today, Review, chat panel                                                                                                                                      | Design system, app shell, error pages, login, onboarding, New CV, CVs, Profile and targets, Pipeline, Settings             |

Why this way: the agent side needs product judgement (sources, ranking quality, prompts) and runs on our paid Featherless/Apify accounts; the account side is fully defined by Figma + spec.

Roadmap per person:

- **Daniil:** LLM layer, model spike, source research, worker + CI (wk 1) → CV parsing, Apify ingestion (wk 2) → master CV, dedupe (wk 3) → runs, ranking, Today (wk 4) → packs, drafts, Review (wk 5) → follow-ups, chat (wk 6) → polish + E2E (wk 7)
- **Artem:** DB, auth, storage, design system, shell (wk 1) → login, onboarding, emails (wk 2) → CV files, New CV, CVs, Profile (wk 3) → settings, error pages, digest, ops view (wk 4) → Pipeline (wk 5) → push, demo seed (wk 6) → accessibility + E2E (wk 7)

## Conventions

- Owner tags: **[Daniil]**, **[Artem]**, **[Both]** (pair / both sign off).
- Contract-first: every endpoint is a zod schema in `packages/shared` + Hono route type, merged before it is implemented.
- One PR per checkbox (or small group). `main` is protected; CI must be green. Daniil reviews Artem's PRs and vice versa.
- Sync points (🔗) = both must be done before the next milestone starts.

## Decisions locked for v1

| Topic             | Decision                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand             | Brand v2 tokens, Space Grotesk + Inter, logo 02 Compass                                                                                         |
| Opportunity types | `job`, `event` (no `person`)                                                                                                                    |
| Routes            | `auto`, `direct`, `event` (no `connection`)                                                                                                     |
| Job source        | Apify actors over Czech job boards, ingested globally, ranked per user                                                                          |
| Event source      | Apify actors: Luma (Prague/Brno/online calendars), Meetup, Eventbrite, others from list                                                         |
| LLM               | Featherless AI via OpenAI-compatible SDK, model per task in config                                                                              |
| Queue             | pg-boss on Postgres                                                                                                                             |
| DB / ORM          | Postgres 17 + Drizzle                                                                                                                           |
| Auth              | Better Auth, Google only, redirect flow (no pop-up → E02 dropped)                                                                               |
| Email             | Resend + React Email (4 templates)                                                                                                              |
| Storage           | S3-compatible (RustFS locally — MinIO stopped publishing images)                                                                                |
| Frontend data     | Typed Hono `hc` client from `packages/shared` + TanStack Query                                                                                  |
| Follow-ups        | 1st at +5 d, 2nd at +7 d after that; no reply after 2nd → `no_reply` (default, can change)                                                      |
| Profile gaps      | Add salary expectation, notice period, languages to profile (Confirm profile step)                                                              |
| Packs             | Prepared only on Pursue (no auto-prepare during runs)                                                                                           |
| Design conflicts  | Spec wins: user always sends; status "Ready to send"; copy "after each run"                                                                     |
| Out of v1         | People discovery, Connection route, billing, hosting, mobile, Terms/Privacy/GDPR export, OCR, interview prep pack, company brief, profile audit |

---

## M0 — Foundation (week 1)

- [x] [Both] Schema v1 (Drizzle): user/account/session, profile (+salary, notice, languages), profile_proof, targets (find_jobs, find_events), schedule, upload, cv, cv_file, agent_run, source, job_posting, event_listing, opportunity, pipeline_item, draft, follow_up, note, activity, chat_thread, chat_message, email_log, push_subscription
- [x] [Both] `packages/shared`: enums (statuses, routes, types, skip reasons…), zod DTOs, API route map, error shape `{code, message, requestId}`
- [x] [Artem] `packages/db`: Drizzle setup, migrations, seed script; docker-compose (Postgres + RustFS (S3; MinIO images discontinued) + Mailpit)
- [x] [Artem] Better Auth (Google) in api; session cookie shared web↔api; `requireUser` middleware; user scoping helper
- [x] [Artem] Storage service (upload, signed GET URL); request-id + structured logging (pino); error middleware (`JP-500-xxxxxx`); rate limit middleware
- [x] [Artem] Design tokens (light/dark from Figma variables), fonts via `next/font`, theme switch (system/light/dark) without reload
- [x] [Artem] Compass logo, app icon, favicon
- [x] [Artem] Core components with all states: Button, TextInput, Select, SearchableSelect, TagInput, Chips, Toggle, Segmented, DropdownMenu/split button, Modal, Toast (queue, undo, sticky errors), Banner, Skeleton, Dropzone, StatusBadge, Stepper, Table, EmptyState _(may spill into week 2)_
- [x] [Artem] App shell: Sidebar (Today, Review, Pipeline, CVs, Profile and targets, user menu), Content, Chat panel slot; typed API client + TanStack Query setup
- [x] [Daniil] `apps/worker` with pg-boss; env validation (`packages/config`, zod) + `.env.example` — plus shared job contract `packages/jobs`
- [x] [Daniil] **LLM layer** `packages/llm`: OpenAI SDK → `https://api.featherless.ai/v1`; `generateObject(zodSchema)` = JSON prompt + validate + 1 repair retry; timeouts, retries, global concurrency limit (Featherless plan limits), token/cost log per user & run, versioned prompt files; model per task in config (parse, rank, write CV, write drafts, chat)
- [x] [Daniil] Spike: pick Featherless models per task (quality vs speed on 5 sample CVs/jobs), document in `docs/llm.md`
- [x] [Daniil] **Research & curate source list** — done, see `docs/sources.md`; (seed for `source`): name, kind (job/event), base URL, Apify actor id, input template, schedule, enabled. Candidates:
  - Jobs: Jobs.cz, Prace.cz, StartupJobs.cz, Profesia.cz, JenPrace.cz, cz.indeed.com, LinkedIn Jobs (Czechia), Welcome to the Jungle / Cocuma, Jobstack.it
  - Events: Luma (Prague/Brno/tech calendars), Meetup (CZ groups), Eventbrite (Prague), Czechitas, StartupJobs events
  - For each: check for an existing Apify Store actor; if none, write a small custom actor (Crawlee) in `apps/actors/` or mark deferred. Record ToS notes and cost per source.
- 🔗 Sync: schema + contracts merged; sign-in works locally; shell renders

## M1 — Sign-in & onboarding (week 2)

- [x] [Artem] 01 Login (Continue with Google, E01); route guards (signed out → login; onboarding unfinished → current step)
- [ ] [Artem] Upload endpoint: type sniffing, ≤5 MB, store original; text extraction (unpdf, mammoth); unreadable → E04
- [ ] [Artem] Onboarding/profile/targets/schedule endpoints; `onboarding_step`; compute `next_run_at` (TZ/DST safe)
- [ ] [Artem] Suggestions endpoints: roles (static + LLM from CV), locations (static CZ + EU list), skills
- [ ] [Artem] Onboarding stepper + resumable progress; Step 1 Upload (dropzone states, replace, LinkedIn/portfolio URL validation, Continue disabled until parsed)
- [ ] [Artem] Step 2 Confirm profile (incl. salary, notice, languages), validation copy from spec §5
- [ ] [Artem] Step 3 Targets (roles, locations incl. "Remote EU"/"Remote worldwide", work format, exclusions, Jobs/Events toggles); Step 4 Schedule (frequency, run time, timezone, email/push toggles)
- [ ] [Artem] Email infra (Resend, `email_log` dedupe, List-Unsubscribe, shared layout); Welcome (01) and Finish-setup reminder (02, +24 h, once)
- [ ] [Daniil] CV parse job: LLM → profile draft; parse status endpoint (used by Step 1/2)
- [ ] [Daniil] Apify client service: start actor runs with input; webhook `POST /webhooks/apify` (signed secret) → enqueue `ingest-dataset`; fallback poller
- [ ] [Daniil] Global ingestion (not per user): cron per source (e.g. jobs every 6 h, events daily) with Czech-wide queries → per-source mapper → `job_posting` / `event_listing`
- 🔗 Sync: in the browser: sign in → upload CV → profile pre-filled → finish onboarding

## M2 — CVs & ingestion quality (week 3)

- [ ] [Artem] CV structured JSON schema; renderers PDF (React-PDF, one-column ATS-friendly) + DOCX (`docx`), cached in `cv_file`, file naming per spec
- [ ] [Artem] CV endpoints: get, confirm (C02), keep original (C03), edit text, delete (C05 rules), compare/diff, download, replace upload (C04)
- [ ] [Artem] 06 New CV review (preview, What changed, original, download, confirm / keep original)
- [ ] [Artem] 09 CVs page (master card, special CV list, actions menu, compare view, E08 fallback to DOCX)
- [ ] [Artem] 11 Profile and targets page (per-section save, "added from chat — Undo", next run)
- [ ] [Daniil] Master CV generation job: rewrite from profile, "What changed", Generating → Needs review, regenerate, failure E05; triggers "Agent is live" email (03)
- [ ] [Daniil] Dedupe (canonical URL + company + title hash), language detection, location normalization (city → CZ region), remote flag, `first_seen/last_seen`, expiry (not seen in N runs → expired)
- [ ] [Daniil] Per-source mapper unit tests with saved dataset fixtures
- 🔗 Sync: onboarding ends on 06 with a real generated CV; job/event tables fill from Apify daily

## M3 — Runs & Today (week 4)

- [ ] [Daniil] Scheduler cron: users due, not paused, onboarding done, master CV confirmed → enqueue `agent-run`; one run per user; manual "Run now"
- [ ] [Daniil] Run steps with progress (reading postings → checking boards & events → ranking → digest), progress endpoint (SSE or polling); >10 min warning; failure state
- [ ] [Daniil] Candidate prefilter in SQL (roles via Postgres full-text/trigram, locations, work format, exclusions, not already shown) — Featherless has no embeddings; cap N per run
- [ ] [Daniil] LLM ranking: fit %, why, gap note, suggested route (direct/event) + reason; uses skip-reason history; per-run caps
- [ ] [Daniil] Today endpoints: list with counts by type, pursue, skip (+reason, undo), dismiss expired, change route
- [ ] [Daniil] 07 Today: header counts, banners (new CV, follow-ups due, run failed, paused, offline), filter chips All/Jobs/Events, opportunity card, Pursue/Skip/Undo/Change route, expired state, empty states incl. "Confirm your CV first", run-in-progress panel
- [ ] [Artem] Run digest email (04) only when something new
- [ ] [Artem] Settings: theme, pause/resume agent (C07, endpoint + UI + banner), sign out (C10)
- [ ] [Artem] Global error handling: 401 → E03 modal, offline E09 banner, E10/E11/E12 toasts; 404 / 500 / Maintenance / No access pages
- [ ] [Artem] Ops view: Apify runs, items ingested, failures per source, LLM cost per user (SQL views or simple admin route)
- 🔗 Sync: a scheduled run shows real Czech jobs + events on Today

## M4 — Packs, Review, Pipeline (week 5)

- [ ] [Daniil] Pack preparation job on Pursue: Direct → special CV + cover text + form answers (why company, salary, notice); Event → registration steps + prep notes; failure → Failed + E06
- [ ] [Daniil] Draft endpoints (get/edit with limits/versions), "I sent it" / "I registered" (+undo, mark as not sent), `.ics` generation
- [ ] [Daniil] 08 Review: Direct steps (download CV, copy/copy all, open page + E07, I sent it C01), Event steps (open, add to calendar, I registered), edit drafts with C08 guard, navigation between items, empty state
- [ ] [Artem] Pipeline endpoints: list with filters/sort, stats, row actions (change route, replied, interview, offer, rejected, add note, stop pursuing C06), notes
- [ ] [Artem] 10 Pipeline: stats row, table, filters + sort, row menu, empty state
- [ ] [Artem] Special CVs on 09 CVs page (statuses, compare with master)
- 🔗 Sync: in the browser: Pursue → Review → I sent it → item in Pipeline with next follow-up

## M5 — Follow-ups, chat, push (week 6)

- [ ] [Daniil] Follow-up job: due follow-ups, drafted follow-up text, `no_reply` after 2nd; event prep notes the day before
- [ ] [Daniil] Follow-up banners on Today and actions in Review
- [ ] [Daniil] Chat endpoint with streaming, screen context, tools: update targets, edit draft, change route, explain ranking, draft follow-up — all reversible via `activity`, no sending tools
- [ ] [Daniil] Chat panel: thread, streaming, suggestion chips per screen, tool-change chips with Undo, limits
- [ ] [Artem] Web Push: VAPID, service worker, subscriptions, permission flow + errors, send when a pack is ready
- [ ] [Artem] Follow-up column and actions in Pipeline
- [ ] [Artem] Demo seed: one user with profile, CVs, Today items, pipeline in every status
- [ ] [Both] Hardening: rate limits on upload/chat/Run now, per-user LLM + Apify caps, cleanup jobs

## M6 — Polish (week 7)

- [ ] [Artem] Accessibility pass (focus rings, 36 px hit area, focus trap, Esc) on components and account screens
- [ ] [Artem] Playwright E2E: sign in → onboarding → CV confirmed
- [ ] [Daniil] Loading/empty/error states checked against spec on Today, Review, chat
- [ ] [Daniil] Playwright E2E: Today → Pursue → Review → I sent it → Pipeline
- [ ] [Both] Design QA against Figma, bug bash, demo

## Later (not v1)

People discovery + Connection route, LinkedIn data-export import, interview prep pack, company brief, profile audit, OCR for scanned CVs, data export / delete account / legal pages, billing, hosting, mobile.
