# JobPilot — feature list (from Figma "HKT")

Source: Figma file `HKT` — pages **Page 1** (screens), **Branding**, **Emails**, **Frontend spec**.
Status: first pass, to be split into tasks. Items marked **⚠** are risky / questionable, **✂** are proposed cuts or deferrals, **❓** need a decision.

---

## 0. Product in one paragraph

JobPilot is an AI agent that runs a user's job search. The user signs in with Google, uploads a CV, confirms a
profile, sets targets and a schedule. On each scheduled run the agent **finds** opportunities (jobs, events, people),
**ranks** them, and on "Pursue" **prepares** an application pack (special CV + messages/answers). **The user always
sends** — there is no auto-submit, auto-register, auto-message or inbox reading anywhere (spec section 0, "Core rule").
After sending, JobPilot tracks the pipeline, reminds about follow-ups and drafts them.

Screens in scope (current version, "v2"): 01 Login, 02–05 Onboarding (Upload / Confirm profile / Set targets /
Schedule), 06 New CV review, 07 Today, 08 Review, 09 CVs, 10 Pipeline, 11 Profile and targets, Settings (spec only),
404 / 500 / Maintenance / No access. Shell: Sidebar + Content + Chat panel.

Old "v1 /" frames (Profile audit, Jobs, Application pack, Tracker, Call prep, Jobs Dark) are superseded — see §13.

---

## 1. Decisions to make before / during build ❓

- [ ] **Brand**: Brand v2 "JobPilot Blue" looks final (light + dark tokens, Space Grotesk + Inter). Pick a logo
      (01 Route … 06 Check; themes are shown with 02 Compass). Variants A/B/C are explorations → ignore.
- [ ] **Job sources** (see §6.2 ⚠) — which APIs we pay for / use.
- [ ] **People discovery** (see §6.4 ⚠) — keep, reduce, or cut from v1 of the product.
- [ ] **LLM provider + models** per task (parse, rank, write CV, write messages, chat). Recommendation: Claude.
- [ ] **Job queue**: pg-boss (Postgres only, recommended to start) vs BullMQ (Redis) vs Trigger.dev/Inngest (managed, durable steps).
- [ ] **Hosting**: web (Vercel or same box), api + worker (Fly / Railway / VPS), Postgres (Neon / Supabase / RDS), file storage (S3 / R2).
- [ ] **Billing / limits** — nothing in the design, but every run costs LLM + search API money. At least: per-user caps.
- [ ] **Mobile** — designs are desktop-only (1440×900). Responsive? Min width?
- [ ] **Follow-up policy** — design says reminder 5 days after "I sent it". How many follow-ups before status `No reply`?
- [ ] **Profile gaps** — Review screen has form answers "Salary expectations" and "Notice period", but onboarding never
      asks for them. Add fields (salary, notice period, languages, work authorization)? v1 also had Languages and Industries.
- [ ] **Terms / Privacy** pages — linked from Login, need real content (CVs + LLM processing → GDPR).

### Design inconsistencies to resolve (spec wins unless decided otherwise)

- [ ] Review screen says "LinkedIn message — **sent by the agent** after approval" → contradicts core rule. Use spec: user copies + sends.
- [ ] "Needs approval" / "drafts need your approval" (Today, Pipeline, CVs, old digest) vs spec status **Ready to send**.
- [ ] CVs page shows CV statuses "Needs approval", "Approved - not sent" — not in the spec's CV status list.
- [ ] Push toggle copy: "Only when something needs approval" (screen) vs "Only when a pack is ready to send" (spec).
- [ ] "Morning digest" — but run time may be 18:00/20:00 and frequency weekly. Copy should say "after each run".
- [ ] Frame "12 Email digest" (Page 1) is an older version of Emails page "04 Daily digest" → use the Emails page.
- [ ] Onboarding 1 shows LinkedIn URL as required-looking; spec says optional.

---

## 2. Foundation / infrastructure

- [x] Monorepo: Turborepo + pnpm, Next.js web (Oxlint, React Compiler), Hono api (Biome), TS everywhere.
- [ ] `apps/worker` — background process for agent runs, CV generation, emails, schedules (same codebase as api or separate app; separate recommended).
- [ ] `packages/db` — Postgres schema + migrations (Drizzle ORM recommended), seed script.
- [ ] `packages/shared` — zod schemas, enums (statuses, routes, types), API contract types shared by web/api/worker.
- [ ] `packages/emails` — email templates (React Email).
- [ ] Typed API client for web (Hono RPC `hc` client or OpenAPI).
- [ ] Env/config validation per app; `.env.example`.
- [ ] Local dev: docker-compose for Postgres (+ Redis if BullMQ, + MinIO for S3).
- [ ] File storage abstraction (S3-compatible): original uploads, generated PDFs/DOCX, data exports. Signed download URLs.
- [ ] Error model: API error shape with code; request id → shown as `JP-500-xxxxxx` (E12). Error tracking (Sentry).
- [ ] Rate limiting on api (→ 429 → E11).
- [ ] Structured logging; agent run logs stored per run for debugging.
- [ ] CI: lint, typecheck, test, build on PR.
- [ ] Testing setup: unit (Vitest), API integration tests against a test DB, a few E2E (Playwright) for onboarding + review flow.
- [ ] LLM layer: one wrapper with retries, timeouts, structured output (zod), token/cost accounting per user and per run, prompt versioning.
- [ ] Ops minimum: way to see runs, failures and costs per user (simple admin page or SQL views). Not in design.

---

## 3. Data model (first draft)

Enums (from spec):

- `opportunity_type`: job | event | person
- `route`: auto ("Let the agent decide") | direct | connection | event
- `pipeline_status`: preparing | ready_to_send | sent | registered | replied | interview | offer | no_reply | rejected | skipped | failed
  - Filter groups: *In progress* = sent, registered; *Got a reply* = replied, interview, offer; *Closed* = no_reply, rejected, skipped
- `cv_status`: generating | needs_review | confirmed | ready_to_send | sent | failed
- `skip_reason`: just_skip | not_relevant | wrong_location | wrong_seniority | company_excluded | already_applied | other
- `experience_band`: lt_1 | 1_3 | 3_5 | 5_10 | 10_plus
- `work_format`: remote | hybrid | onsite
- `run_frequency`: daily | every_3_days | weekly
- `theme`: system | light | dark

Tables:

| Table | Key fields | Notes |
| --- | --- | --- |
| `user` | id, email, name, avatar_url, timezone, theme, paused_at, onboarding_step, onboarding_completed_at, deleted_at | |
| `account`, `session` | Google OAuth account + sessions | from auth library |
| `profile` | user_id, full_name, current_title, experience_band, location, linkedin_url, portfolio_url, skills[] (≤20), summary | "Everything JobPilot believes about you" |
| `profile_proof` | profile_id, text, position | "Projects and proof" list |
| `targets` | user_id, roles[] (1–5), locations[] (1–5), work_formats[] (≥1), exclusions[] (≤10), find_jobs, find_events, find_people (≥1 on) | tags 2–40 chars, dedup |
| `schedule` | user_id, frequency, run_time (HH:00), day_of_week, notify_email, notify_push, next_run_at | timezone on user |
| `push_subscription` | user_id, endpoint, keys, user_agent | Web Push |
| `upload` | user_id, kind (cv_original), storage_key, filename, mime, size, pages, parse_status, extracted_text | original CV, kept unchanged |
| `cv` | user_id, kind (master \| special), version, status, content (structured JSON), based_on_cv_id, opportunity_id/pipeline_item_id, change_summary[], confirmed_at, sent_at | "use original" = master derived from original |
| `cv_file` | cv_id, format (pdf \| docx), storage_key, created_at | rendered on demand, cached |
| `agent_run` | user_id, trigger (scheduled \| manual), status, step progress, started_at, finished_at, counts, error, cost | drives "Your agent is working…" |
| `opportunity` | user_id, run_id, type, title, company, location, source, url, dedupe_key, fit_score, why, gap_note, suggested_route, route_reason, available_routes, event_starts_at, person_name/role, feed_status (new \| dismissed \| pursued \| skipped \| expired), raw | the Today cards |
| `pipeline_item` | opportunity_id, user_id, route, status, sent_at, registered_at, next_follow_up_at, skip_reason, skip_note | created on Pursue (or Skip, for feedback) |
| `draft` | pipeline_item_id, kind (cover_text \| form_answer \| connection_note \| follow_up \| event_prep), label, body, char_limit, version, edited_by_user | Copy / Edit text |
| `follow_up` | pipeline_item_id, due_at, status (pending \| done \| cancelled), draft_id | |
| `note` | pipeline_item_id, body | "Add note" |
| `activity` | user_id, entity, entity_id, action, before, after, created_at | status history, undo, stats, agent feedback |
| `chat_thread`, `chat_message` | user_id, screen context, role, content, tool calls, applied_change_id | chat changes are undoable |
| `email_log` | user_id, template, dedupe_key, provider_id, sent_at | guarantees "sent once" |
| `data_export` | user_id, status, storage_key, expires_at | |

Open: should skipped/ignored opportunities also be `pipeline_item`s, or only `opportunity.feed_status`? (Spec: Skip
from Today does not show in Pipeline unless pursued; "Stop pursuing" sets Skipped on a pipeline item.)

---

## 4. Auth and account

- [ ] Google sign-in only (Better Auth or Auth.js; Better Auth fits Hono well). Session cookie shared web ↔ api.
- [ ] Login page (01): logo, tagline, "Continue with Google", Terms/Privacy note.
- [ ] Errors: E01 Google sign-in failed, E02 pop-up blocked (only if we use pop-up flow; a redirect flow avoids it ✂).
- [ ] E03 session expired: any 401 → modal → sign in again, keep work.
- [ ] Route guards: not signed in → "No access" page / login; onboarding not finished → onboarding.
- [ ] Sign out (user menu) with C10 confirmation when packs are ready to send.
- [ ] Welcome email on first sign-in (see §10).

## 5. Onboarding (4 steps) and profile

Shared stepper "Set up your JobPilot": 1 Upload · 2 Confirm profile · 3 Set targets · 4 Schedule. Progress is saved per step (resumable; drives reminder email).

**Step 1 — Upload**
- [ ] CV dropzone: PDF/DOCX, ≤5 MB, 1 file; states idle / drag over / uploading % / reading / success (pages count) / error; replace file.
- [ ] Upload to storage, then parse: text extraction (PDF: unpdf/pdf.js; DOCX: mammoth) → LLM structured extraction into profile draft.
- [ ] Detect unreadable files (scan, password, broken) → "We could not read this file…" / E04. ✂ OCR for scans later.
- [ ] LinkedIn URL (optional, linkedin.com) and GitHub/portfolio URL (optional, any URL); validate on blur/submit.
- [ ] ⚠ We cannot fetch LinkedIn profiles (login wall, ToS). Store the URL only. Optional: accept LinkedIn "Save to PDF" export (was in v1) as a second source.
- [ ] Optional: read public GitHub profile/repos via GitHub API to enrich "Projects and proof".
- [ ] Continue disabled until CV uploaded and parsed.

**Step 2 — Confirm profile**
- [ ] Fields: full name, current title, experience (single select, required), location, skills (tag input ≤20), projects and proof (list, inline edit, add/remove).
- [ ] Pre-filled from the CV; validation messages exactly as in spec §5.

**Step 3 — Set targets**
- [ ] Target roles (tags 1–5, suggestions), Locations (tags 1–5, suggestions incl. "Remote EU", "Remote worldwide"), Work format chips (≥1, default Remote+Hybrid), Exclusions (tags ≤10), What to look for toggles (Jobs/Events/People, ≥1, default all on).
- [ ] Tag input component: Enter/comma adds, Backspace removes, 2–40 chars, dedupe, "Add '…' as a new tag" last row.
- [ ] Suggestion sources: roles (static list + LLM from CV), locations (city/country list — e.g. GeoNames subset), skills.

**Step 4 — Schedule and notifications**
- [ ] Frequency (Daily default / Every 3 days / Weekly + Day of week), Run time (06–20 list, default 08:00), Time zone (searchable IANA list, default from browser), Notify by Email (on) / Push (off).
- [ ] Push on → browser permission prompt; denied → revert + error. Both off → hint.
- [ ] Finish → compute `next_run_at`, trigger master CV generation (§7), go to 06 New CV screen.

**Profile and targets page (11)** — same controls, always editable, saves per field/section; shows "added from chat — Undo"; schedule summary with "Next run: …".

## 6. The agent (runs, discovery, ranking)

### 6.1 Scheduler and runs
- [ ] Scheduler: every few minutes pick users with `next_run_at <= now`, not paused, onboarding done → enqueue run; recompute next run in user's TZ (DST-safe).
- [ ] Manual "Run now" (Today empty state, failed-run banner); disabled while a run is in progress; toast "Run started…".
- [ ] Run pipeline with visible steps: Reading new postings → Checking job boards and event pages → Ranking matches → Preparing the digest. Progress pushed to web (SSE or polling).
- [ ] Idempotency + one run per user at a time ("The agent is busy with a run" toast); >10 min → "taking longer than usual".
- [ ] Failure → banner "The last run failed" + retry at next schedule.
- [ ] Pause / resume agent (C07): no runs, no emails while paused; banner.
- [ ] Per-run caps (max new opportunities, max LLM spend).

### 6.2 Job discovery ⚠
- [ ] ⚠ Design names LinkedIn, Indeed, Glassdoor. Scraping them violates ToS and is actively blocked → **do not scrape**.
- [ ] Use legal sources instead, behind one `JobSource` interface:
  - job aggregator APIs (e.g. Adzuna, Jooble, JSearch/Google-Jobs via SerpAPI-like provider),
  - public ATS board APIs for "company portals" (Greenhouse, Lever, Ashby, Workable, SmartRecruiters),
  - LLM web search (Exa / Tavily / Brave) as a fallback.
- [ ] Normalize → dedupe across sources and runs (canonical URL + company + title hash) → filter by targets/exclusions/work format/location.
- [ ] Availability check (posting closed → card "No longer available", E07 on Open page). ⚠ best effort.

### 6.3 Event discovery ⚠
- [ ] Meetups, hackathons, career fairs near target locations / online. ⚠ Meetup API is limited, Eventbrite public search API is gone → web search + LLM extraction (date, place, URL).
- [ ] ✂ "2 hiring managers from your target companies attend" — attendee lists aren't available. Drop this kind of "why".
- [ ] `.ics` generation for "Add to calendar".

### 6.4 People discovery ⚠ ❓
- [ ] Recruiters / hiring managers for target roles. ⚠ No LinkedIn people API; scraping is not allowed; storing third-party personal data has GDPR implications.
- [ ] Possible legal scope: people who **publicly** posted a role (job posting "posted by", company careers/team pages, public posts found via web search). Store minimal data (name, role, public profile URL, source).
- [ ] ⚠ "You know 1 person there — ask for an intro" needs the user's connections. Only realistic path: user imports LinkedIn data-export `Connections.csv` (optional feature). ✂ Otherwise drop "warm intro" detection.
- [ ] Recommendation: ship v1 with Jobs + Events, People behind a flag.

### 6.5 Ranking and routes
- [ ] Fit score (%) + one-line "Why" + gap note ("1 keyword missing in your CV") via LLM against profile + targets.
- [ ] Use skip reasons and status history as feedback in ranking prompts; "Company excluded" also adds company to exclusions.
- [ ] Route suggestion: auto / direct / connection / event with reason; unavailable routes disabled with reason ("No contacts found", "No upcoming events").

## 7. CVs

- [ ] **CV as structured data** (JSON: header, summary, experience with bullets, skills, education, projects) → rendered to PDF and DOCX. Enables edit, diff, regenerate.
- [ ] Renderers: PDF (React-PDF or HTML → PDF via headless Chromium; one-column ATS-friendly template) and DOCX (`docx` lib). File names: `Name_CV_JobPilot_v1.pdf`, `CV - Company - Role.pdf`.
- [ ] **Master CV generation** after onboarding: LLM rewrites from profile; "What changed" list; status Generating → Needs review. Email 03 when ready. Failure → E05 (Use my original / Try again).
- [ ] **06 New CV screen**: preview, What changed, original file, Download (PDF/DOCX), "Confirm and use this CV" (C02), "Keep my original instead" (C03 → master built from original text).
- [ ] Banner + Today empty state "Confirm your CV first" — no drafts prepared until a master CV is confirmed.
- [ ] **Special CV** per pursued job: derived from master, change summary ("headline, 4 bullets, keyword order"), fit %, "ATS check passed" (⚠ define as our own heuristic: parseable layout + keyword coverage; do not claim a real ATS).
- [ ] **CVs page (09)**: master card (Compare with original), special CV list with statuses + count.
- [ ] CV actions menu: View, Edit text, Compare with master (diff), Download (PDF/DOCX), Regenerate, Delete (C05). Rules: no Delete on confirmed master; no Edit/Regenerate when Sent.
- [ ] Upload new CV (C04 Replace): re-parse profile, rewrite master (new version); already sent CVs unchanged.
- [ ] E08 download failed → offer DOCX.

## 8. Daily work screens

### 8.1 Today (07)
- [ ] Header: date, "N new, M ready to send". Banners (new CV, follow-ups due, last run failed, paused, offline).
- [ ] Filter chips All/Jobs/Events/People with counts; 0 → disabled; type off in targets → hidden.
- [ ] Opportunity card: type, title, company/place/source or event date, fit %, Why, Route + reason.
- [ ] Actions: Pursue → "Preparing your pack…" → moves to Review; Skip (one click) + reasons menu (+ "Other…" ≤200 chars) → collapsed "Skipped — Undo" 10 s; Change route (regenerates, skeleton); Expired → greyed + Dismiss only.
- [ ] Empty states: before first run (Run now), nothing new, all caught up, confirm CV first.
- [ ] Run-in-progress panel.

### 8.2 Pack preparation (worker job on Pursue)
- [ ] Generate per route: **Direct** → special CV + cover text + form answers (Why this company?, Salary expectations, Notice period…); **Connection** → message/connection note (≤300 chars counter) + optional CV; **Event** → no CV, registration steps + prep notes.
- [ ] Optional company brief (from v1 "Application pack") — ✂ later unless cheap via web search.
- [ ] Failure → status Failed + E06 (Skip for now / Try again).

### 8.3 Review (08)
- [ ] Header: title — company, route, status; Skip with reasons.
- [ ] Route **Direct**: 1 Download CV (PDF/DOCX) · 2 Copy / Copy all (per field, toast) · 3 Open page (new tab; E07 if dead) · 4 I sent it (C01).
- [ ] Route **Connection**: 1 Copy message (limit counter) · 2 Open LinkedIn (person's profile) · 3 Download CV (optional) · 4 I sent it.
- [ ] Route **Event**: 1 Open event page · 2 Add to calendar (.ics) · 3 I registered → Registered; prep notes the day before.
- [ ] Edit text of any draft (validation: not empty, platform limit), unsaved-changes guard (C08), save errors (E10).
- [ ] "I sent it" → status Sent + date, follow-up in 5 days; Undo in toast 10 s; later "Mark as not sent".
- [ ] Empty state "No drafts to review". Navigation between items waiting for review.

### 8.4 Pipeline (10)
- [ ] Stats row: Ready to send, Sent, Replied, Interviews, Offers.
- [ ] Table: Opportunity, Type, Route, Status, Next follow-up / next step.
- [ ] Filters: status group + type (AND, Clear filters, empty state); Sort: next follow-up (default) / newest / status / company A–Z.
- [ ] Row menu: Open (→ Review), Change route, Mark as replied, Add note, Stop pursuing (C06: Skipped + cancel follow-ups).
- [ ] Manual status changes: Replied, Interview (date/time?), Offer, Rejected — agent can't see replies.
- [ ] Empty state "Nothing in motion yet".

### 8.5 Follow-ups
- [ ] 5 days after Sent: follow-up due → banner + digest line + drafted follow-up text; user sends and marks it.
- [ ] After N follow-ups with no reply → No reply (❓ N) and suggest another route ("Try route: Connection").
- [ ] Event: prep notes generated the day before the event.
- [ ] ✂/later: interview prep pack ("Prep me for Thursday", "prep pack ready" in Pipeline) — this is the v1 "Call prep" screen (company brief, likely questions, questions to ask). Could live inside chat first.

## 9. Chat panel (on every screen)

- [ ] Right panel, thread per user, persisted; streaming answers; typing indicator; input disabled while answering; Enter / Shift+Enter; ≤2000 chars.
- [ ] Screen-aware suggestion chips (Today: "Why this one?"; Review: edit requests; Pipeline: prep requests); click sends.
- [ ] Context: current screen + selected item (opportunity / draft / pipeline item) + profile/targets.
- [ ] Tools the agent may call (all reversible, shown in UI with Undo): update targets (add exclusion…), edit a draft, change route, explain ranking, prepare follow-up/prep notes. **No sending tools.**
- [ ] Empty state "Ask or tell the agent anything".

## 10. Notifications

**Email** (exactly 4, per Emails page; provider: Resend / Postmark / SES)
- [ ] 01 Welcome — right after first Google sign-in.
- [ ] 02 Finish setup reminder — 24 h after sign-up if onboarding unfinished, sent once; shows step checklist.
- [ ] 03 Agent is live — onboarding done and master CV generated; summary (looking for, where, runs, notifies by).
- [ ] 04 Run digest — after a run, only if something new (and email on): new opportunities by type, packs ready, follow-ups due.
- [ ] Shared layout: logo, footer "You always send it yourself", Manage notifications + one-click Unsubscribe (List-Unsubscribe header).
- [ ] SPF/DKIM/DMARC on sending domain; `email_log` dedupe.

**Push**
- [ ] Web Push (service worker + VAPID); only when a pack is ready to send; permission flow and error per spec.
- [ ] ⚠ "Wake up and prepare packs" — note: packs are prepared only after Pursue, so "ready" push happens after user action. ❓ Should the agent auto-prepare top matches during the run? (Changes cost and the Today flow.)

## 11. Settings and account

- [ ] Settings page (not drawn — only in spec): Theme (System/Light/Dark, per user, applies instantly), Pause/Resume agent, Export my data (ZIP: profile, CVs, pipeline — async job + download link), Delete account (C09 type DELETE → hard delete data + files + cancel jobs).
- [ ] User menu (sidebar bottom): Profile and targets, Settings, Pause/Resume agent, Sign out.
- [ ] Notification preferences reachable from email "Manage notifications".

## 12. Design system and UI shell

- [ ] Tokens from Brand v2 (light: primary #1F5BFF, ink #0B0D12, surface #F6F7F9, soft #EAF0FF, accent #12A150, line #E4E7EC; dark: #5B8CFF / #F4F6FA / #151922 / #16213F / #3DDC84 / #262C38) + danger + warning (pull exact values from Figma variables "JobPilot / Color").
- [ ] Fonts: Space Grotesk (headings), Inter (text) via `next/font`.
- [ ] Logo + app icon + favicon (after logo decision).
- [ ] Components with all states (spec §4): Button (primary/secondary/danger; hover/focus/loading/disabled + tooltip), Text input, Select, Searchable select, Tag input, Chips, Toggle, Segmented control, Dropdown menu (split button), Modal/dialog, Toast (one at a time, bottom-center, 4 s / 10 s with Undo, error toasts sticky), Banner, Skeleton (>300 ms), Dropzone, Status badge, Stepper, Table, Opportunity card, Empty state.
- [ ] App shell: Sidebar (nav: Today, Review, Pipeline, CVs, Profile and targets; user menu), Content, Chat panel.
- [ ] Theme switching (system/light/dark) without reload.
- [ ] Global error handling: E09 offline detection + banner, E10, E11, E12 with error code, E03 on 401.
- [ ] Full-page states: 404, 500, Maintenance (flag), No access.
- [ ] Accessibility: keyboard focus rings, 36 px min hit area, dialog focus trap, Esc closes.

## 13. Old v1 frames — what to keep ✂

| v1 frame | Verdict |
| --- | --- |
| 02 Onboarding (CV + LinkedIn PDF + search goals with Languages/Industries) | Superseded by 4-step onboarding. Consider re-adding Languages / Industries fields ❓ and LinkedIn PDF import. |
| 03 Profile audit (CV/LinkedIn scores, what to fix, LinkedIn fields ready to paste) | ✂ Not in v2. Nice later feature ("LinkedIn helper"); needs LinkedIn PDF import. |
| 04 Jobs (+ Dark) | Superseded by Today. |
| 05 Application pack (fit, verdict, strengths, gaps, cover letter, tailored CV, company brief) | Merged into Today + Review. Strengths/gaps/company brief → optional in Review. |
| 06 Tracker | Superseded by Pipeline. |
| 07 Call prep (brief, why hiring, likely questions, questions to ask) | ✂ Later. v2 still hints at it ("prep pack ready", "Prep me for Thursday"). |

## 14. Legal, privacy, security

- [ ] Terms of Service + Privacy Policy pages; cookie notice only if non-essential cookies are used.
- [ ] GDPR: data export, delete account, data retention for files, list of processors (LLM, email, storage, search APIs), DPA with LLM provider, no training on user data.
- [ ] Security: auth on every api route with user scoping, signed URLs for files, upload validation (type sniffing, size), CSRF on cookie auth, secrets management.
- [ ] Rate limits and abuse protection on uploads, chat and Run now.

## 15. Suggested build order (to split into tasks)

1. Foundation: db package, shared package, worker app, storage, auth (Google), app shell + design tokens + core components.
2. Onboarding steps 1–4 + Profile and targets page + CV upload/parse.
3. CV model + PDF/DOCX rendering + master CV generation + 06 New CV screen + CVs page.
4. Scheduler + agent runs + job discovery (1–2 sources) + ranking → Today.
5. Pursue → pack preparation → Review (Direct route first), I sent it, Pipeline.
6. Emails (4) + follow-ups.
7. Chat panel with tools.
8. Events route, then People/Connection route (if kept).
9. Push, Settings (theme, export, delete, pause), all error/empty/loading states, 404/500/maintenance.
10. Hardening: rate limits, cost caps, monitoring, legal pages, E2E tests.
