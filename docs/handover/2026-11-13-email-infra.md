# Handover: email infra + emails 01/02 (M1, Artem's item, done by Daniil)

**From:** Daniil · **To:** Artem · **Date:** 2026-11-13

I took `Email infra … Welcome (01) and Finish-setup reminder (02)` off your list. **Please review the small changes in your auth and api code** (bottom of this note).

## What's in

- **`packages/emails`:** plain TS templates (no React Email, because Node can't run `.tsx` without a build) that return `{ subject, html, text }`.
  - Shared layout: brand colours, compass logo, footer "JobPilot prepares, you always send it yourself", **Manage notifications** and **Unsubscribe** links. All user values are escaped.
  - Templates: `welcome` (01) and `finish_setup_reminder` (02, a checklist of the 4 onboarding steps). `agent_live` and `run_digest` still throw "not implemented yet".
  - Senders: Resend over `fetch` when `RESEND_API_KEY` is set, **otherwise a preview sender** that writes each email as HTML into `.cache/emails/`.
  - Signed unsubscribe token (HMAC with `BETTER_AUTH_SECRET`).
- **Worker:**
  - `email.send` writes `email_log` (unique `dedupe_key`, so each email is sent once; a failed one is retried) and adds `List-Unsubscribe` + `List-Unsubscribe-Post` headers.
  - Welcome is transactional, so it ignores the notification setting. Other emails skip unsubscribed or paused users and `notify_email = false`.
  - `email.finish-setup-reminders` runs hourly: users signed up more than 24 h and less than 7 days ago, onboarding unfinished, no reminder yet → enqueue one.
- **api:**
  - Welcome is enqueued on first Google sign-in (Better Auth `databaseHooks.user.create.after`).
  - `/v1/email/unsubscribe`:
    - POST is the one-click route used by mail clients.
    - GET (footer link) shows a small "You're unsubscribed" page.
    - Both set `user.email_unsubscribed_at` and `schedule.notify_email = false`. The route needs no session and is rate-limited per IP.

## Changes in your code

- `infrastructure/auth/better-auth.ts`: optional `onUserCreated` param, plus the `databaseHooks.user.create.after` block. Errors are swallowed, so sign-in never breaks.
- `main.ts`: `jobs` is created before `createAuth`; `onUserCreated` → `jobs.enqueueWelcomeEmail(id)`; `createApp` gets `email: { preferences, secret }`.
- `app.ts`: optional `email` dep; the unsubscribe route is mounted before the session-protected `/v1`.
- `pg-boss-job-queue.ts`: also implements a new `EmailJobQueue` port (`enqueueWelcomeEmail`). It's a separate port, so your `{ enqueueCvParse }` test fakes still compile.
- `rate-limit.ts`: new `rateLimits.unsubscribe` (20/min per IP).

## Env

- `RESEND_API_KEY` (empty = preview files), `EMAIL_FROM`, `EMAIL_PREVIEW_DIR`, `API_URL`.
- The worker now also needs `BETTER_AUTH_SECRET` (it signs unsubscribe tokens).
- In production, `API_URL` must be publicly reachable (or point it at `WEB_URL`, which proxies `/v1`).

## Tested

- emails 11, worker 86 (+6), api 40 (+3 unsubscribe).
- **Live** with the preview sender: the demo user got both emails as HTML files, and a second run skipped both (sent once). A user created 25 h ago with onboarding unfinished got exactly one reminder enqueued.
- **Not tested end to end:** the Better Auth hook with a real Google sign-in.
- **Caveat:** GET unsubscribe acts immediately, so a mail scanner that prefetches links could unsubscribe a user. Switch it to a confirm button if that shows up.
