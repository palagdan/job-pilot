# Handover: onboarding endpoints + next run (M1, Artem)

**From:** Artem · **To:** Daniil · **Date:** 2026-11-13

## For your scheduler: `nextRunAt` is shared

`@job-pilot/shared/next-run` → `nextRunAt(rule, now, lastRunAt)`, where `rule = { frequency, runHour, dayOfWeek, timezone }`.

- Pure, no deps, Intl-based. Daily / weekly / every-3-days are resolved in the user's IANA zone and stay at the same local hour across DST.
- Tests cover the Prague 2026 switches, the spring gap and the autumn overlap, New York and Kolkata.
- **After each run, set** `schedule.next_run_at = nextRunAt(rule, now, run.finishedAt)` (time zone is `user.timezone`), **and** `last_run_at`.
- every_3_days counts 3 local days from `lastRunAt`; if that moment has passed (paused, downtime), it uses the next daily slot.
- The api already sets `next_run_at` on schedule save and on onboarding complete.

## `cv.generate-master` is now enqueued

`POST /v1/onboarding/complete` sends `{ userId, uploadId }` (the user's current parsed CV upload), once — the endpoint is idempotent.

## Onboarding flow (api)

| Step | Endpoint | Moves to |
| --- | --- | --- |
| 1 Upload | `POST /v1/uploads/cv` → poll `GET /v1/uploads/:id` → `PUT /v1/onboarding/links` (needs `parsed`) | confirm_profile |
| 2 Confirm profile | `PUT /v1/profile` (sets `profile.confirmed_at`) | set_targets |
| 3 Set targets | `PUT /v1/targets` | schedule |
| 4 Schedule | `PUT /v1/schedule`, then `POST /v1/onboarding/complete` | done |

- Steps only move forward. Saving a later step's data before reaching it → 409.
- Your parse pre-fill only fills empty fields, and the user's `PUT /v1/profile` overwrites with confirmed values — the two fit.

## Contract change

`getTargets` / `putTargets` / `patchTargets` now respond with `targetsViewSchema`, a looser shape. Before step 3, GET returns the defaults with no roles yet, which the strict input schema would reject.
