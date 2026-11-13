# Handover: onboarding Step 4 Schedule (M1, Artem's item, done by Daniil)

**From:** Daniil · **To:** Artem · **Date:** 2026-11-13

`app/onboarding/[step]/schedule-step.tsx` (+ css), rendered for `schedule`. No api changes. **Onboarding steps 1–4 now all work in the browser.**

## Flow

1. `GET /v1/schedule`. If it was never saved (`nextRunAt` null), the timezone defaults to the browser's (`Intl…resolvedOptions().timeZone`); the list comes from `Intl.supportedValuesOf('timeZone')`.
2. **Finish setup** sends `PUT /v1/schedule` (schedule + timezone, computes `next_run_at`), then `POST /v1/onboarding/complete`. It sets and invalidates `me`, then goes to **`/cvs`**. That's a placeholder, because the 06 New CV screen doesn't exist yet: **change the redirect when 06 lands.** Back goes to `/onboarding/set-targets`.
3. Errors: api `fields` errors show on the fields; other `ApiError`s (e.g. "Confirm your profile first.") show as a toast.

## Form

- Frequency is a Segmented control. Day of week shows only for weekly (Mon–Sun → 1–7).
- Run time uses the shared `runHours` (06, 07, 08, 09, 10, 12, 18, 20). That isn't every hour 06–20; change the shared enum if the spec means every hour.
- There is a client-side "Next run: …" preview using the shared `nextRunAt`.
- **Push:** `Notification.requestPermission()`; if not granted, the toggle reverts with an inline error. **Web Push subscription is not built**: only `notifyPush` is stored.
- When both notifications are off, `messages.noNotificationsHint` is shown.

## Tested

Live through :3000:

- the page returns 200
- weekly without a day returns 400 `fields.dayOfWeek`
- valid PUTs return 200 with a correct `nextRunAt`
- `complete` returns 200
- **the real worker** turned the master CV into `needs_review` in about 40 s, and the `agent_live` email was sent (a preview file in `.cache/emails/`)

Web lint and typecheck pass. **Not checked in a browser:** the layout, the push prompt, the timezone search, the preview and the redirect.

## Master CV quality note (first live run)

The demo user's profile (marketing) and the test CV (frontend engineer) don't match. The rewrite produced a summary that mixes both ("Performance marketing lead… Senior Frontend Engineer…"). For real users the profile comes from the same CV, but the `write-master-cv` prompt should say: when the profile and CV conflict, follow the profile and drop the contradicting CV text. That would be `write-master-cv@2`.
