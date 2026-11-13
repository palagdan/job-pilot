# Handover: pack preparation job (M4, Daniil)

**From:** Daniil · **To:** Artem · **Date:** 2026-11-13

The worker now handles `pack.prepare { pipelineItemId }`, which your Pursue flow (via my Today api) enqueues.

## What it does

- Skips unless the item is `preparing`. Uses the confirmed, non-superseded master CV, else the latest `needs_review` one; none → failed with E06.
- **Direct (job):**
  - **Special CV:** a `cv` row with kind `special`, `basedOnCvId` = the master, linked to the item, with `changes`. The prompt is `write-special-cv@1` on DeepSeek: tailored to the posting using only facts from the master CV.
  - **Drafts:**
    - 0 `cover_text`: `write-cover@1`, in the posting's language
    - 1 `form_answer` "Why this company?": `write-why-company@1`
    - 2 "Salary expectations": from the profile, no LLM ("120 000–150 000 Kč měsíčně" for Czech postings, CZK/EN otherwise, "Negotiable"/"Dle dohody" when missing)
    - 3 "Notice period": from the profile ("2 měsíce" / "2 months")
- **Event:** no CV. Two `event_prep` drafts, "Registration steps" and "Prep notes" (`write-event-prep@1`).
- The CV, cover and why-company calls run in parallel. One transaction replaces the old drafts and special CV, then sets the item to **`ready_to_send`**.
- **Failure:** the item becomes `failed` with `failureReason` = `messages.packFailed` (E06: "We could not prepare this application. Skip it for now or try again."). It isn't retried. **"Try again"** = set the item back to `preparing` and enqueue `pack.prepare` again.

## For your screens

- **Special CV status is `ready_to_send`.** Your `assertEditable` only blocks `sent`/`generating`, so edit and download work.
- Your `regenerateCv` still returns a conflict for special CVs. Route "regenerate" for special CVs to re-enqueue `pack.prepare` instead.
- Draft labels are English even for Czech postings; only the text follows the posting language.

## Tested

- Worker 118 tests (6 handler + 6 formatting new), llm 16, shared 13; lint and typecheck pass.
- **Live (DeepSeek, about 50 s per pack):**
  - "Head of Brand", Vilgain (English posting): English cover + answers.
  - "Obchodní manažer/ka", Apex (Czech posting): fully Czech cover, why-company, "120 000–150 000 Kč měsíčně", "2 měsíce".
- **Event packs** are covered only by tests with a fake LLM, not live.

## Quality notes (prompt v2 candidates)

- The headline stays the master's when the role differs, and the change wording is "Headline kept as…" instead of "matched to X".
- The cover text stretches a marketing profile toward a sales role ("vedení týmů, obchodní výsledky"). It has small Czech grammar/gender slips ("Obchodního manažera", "mohl/a") and starts with "Vážení," on the same line as the first sentence.
- The demo user's master CV mixes marketing with a frontend background (seed data vs test CV), and that shows in the special CV summaries.
- Each pack takes about 50 s, slower than the ~13 s per call in `docs/llm.md`, because three DeepSeek calls run per pack.
