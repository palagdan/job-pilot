# Handover: follow-ups (M5, Daniil)

**From:** Daniil · **To:** Artem · **Date:** 2026-11-13

## Worker: `follow-up.check`, hourly (`0 * * * *`, Europe/Prague)

- **Due follow-ups** (pending, `due_at <= now`, item `sent`, no draft yet): `write-follow-up@1` (DeepSeek) writes a `follow_up` draft "Follow-up #N" in the posting's language (#1 is a gentle check-in, #2 a last brief note), linked through `follow_up.draft_id`. This is idempotent, and `next_follow_up_at` is kept at the earliest pending due date.
- **No reply:** a `sent` item whose follow-up #2 was done more than 7 days ago becomes `no_reply`; remaining follow-ups are cancelled and an activity row is written (actor system).
- **Event prep:** `registered` events within 24 h get a "Prep notes" draft if one is missing.
- Each item has its own error handling, so a failed item is retried next hour.

## api (all owner daniil; none of your routes were changed)

- **`POST /v1/follow-ups/:id/done`** (`completeFollowUp`) now returns `{ undoToken, nextFollowUpAt }`. Completing #1 creates **#2 due +7 d**. It's undoable for 10 s via `/v1/undo`, which restores #1 and deletes #2. The item must be `sent` and the follow-up pending, otherwise 409.
- `GET /v1/today` has two new fields: `followUpsDue { count, firstPipelineItemId }` and `eventsTomorrow [{ pipelineItemId, title, startsAt }]`.
- `GET /v1/pipeline/:id/review` has a new `followUps[]` (with drafts). Follow-up drafts are removed from `drafts` there.
- **"They replied" reuses your `PUT /v1/pipeline/:id/status { status: 'replied' }`**, which also cancels pending follow-ups.

## Web

- **Today:** a warning banner "N follow-ups due" goes to Review, and an info banner "Event tomorrow: …" goes to the prep notes.
- **Review** for a sent item, in a Follow-ups section:
  - the status and drafted text for each follow-up (editor + Copy)
  - "I sent the follow-up" with an Undo toast
  - "They replied"
  - a "No reply" banner with the hint "Try another route"
- **Your Pipeline follow-up column is untouched.**

## Tested

- Worker 128 (7 new), api 120 (new `follow-ups.test.ts`), llm 16, shared 13; lint and typecheck pass for all.
- **Live:** follow-up #1 backdated to due now → a Czech follow-up drafted (~70 words, cites a profile fact) → the Today banner showed 1 due → complete → #2 due +7 d → undo → complete again.
- **Not tested live:** the `no_reply` change and event prep, which are covered by the integration tests only. Nothing was checked in a browser.
