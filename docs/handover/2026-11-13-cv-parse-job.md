# Handover: CV parse job (M1, Daniil)

**From:** Daniil · **To:** Artem · **Date:** 2026-11-13

The worker now handles `cv.parse { uploadId }` (`apps/worker/src/handlers/parse-cv.ts`).

## What your upload endpoint must do

1. Store the file with `storageKeys.upload(userId, uploadId, ext)`.
2. Insert the `upload` row with status `pending`.
3. Call `queue.send('cv.parse', { uploadId })`.

**No text extraction in the api**: the worker does it. `GET /v1/uploads/:id` just returns `parse_status` / `parse_error`.

## What the job does

- `pending → extracting → parsing → parsed | failed`.
- **Extraction:** PDF with `unpdf` (also sets `page_count`), DOCX with `mammoth`. Under 200 characters of text (scans, broken or protected files) → `failed`, with `parse_error` = `messages.cvUnreadable` (E04 copy).
- **Parsing:** `parse-cv@1` on Qwen3-14B → `parsed_content` (`CvContent`).
- **Profile pre-fill** in the same transaction, **only into empty fields** (the user's values always win):
  - name, title, location, LinkedIn and portfolio links (with `https://` added)
  - summary, skills (max 20, deduped), languages
  - experience band (from the span of the experience dates)
  - "Projects and proof" from the CV projects, only if the user has none yet
- **Idempotent:** a parsed or replaced upload is skipped. Errors mark `failed` and are not retried by pg-boss; the LLM layer already retries.

## Env

The worker now needs `FEATHERLESS_API_KEY` and the `S3_*` storage vars (same as the api).

## Tested

- End to end on local Postgres with the live model: generated PDF → `parsed` in 12.5 s, profile filled correctly, re-run skipped, garbage file → `failed` + E04 copy.
- Worker lint and typecheck pass.
- **No automated tests yet** (cut for hackathon time).
