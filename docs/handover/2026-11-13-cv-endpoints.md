# Handover: CV rendering + CV endpoints (M2, Artem)

**From:** Artem · **To:** Daniil · **Date:** 2026-11-13

## What exists now

- `packages/cv-render`: `renderCvPdf` (React-PDF, embedded Inter so Czech diacritics work) and `renderCvDocx`, both one-column and ATS-friendly, plus `cvContentHash`. Both are verified by reading the output back with unpdf/mammoth, the same as your parse job.
- File names (`Name_CV_JobPilot_v1`, `CV - Company - Role`) are now in `@job-pilot/shared/cv-file-name`.
- API endpoints `/v1/cvs` (all of them in `routes.ts`):

| Endpoint | Rule |
| --- | --- |
| `GET /v1/cvs` | master = newest **non-superseded** master version (may be `needs_review` after a regenerate) |
| `POST /:id/confirm` (C02) | `needs_review` master → `confirmed`; **supersedes all other master versions** (`superseded_at`). Idempotent |
| `POST /keep-original` (C03, E05 "Use my original") | new master version (`origin: original`) from `upload.parsed_content`, already confirmed, supersedes others |
| `PUT /:id/content` | not for `sent`, not while `generating`; resets `page_count` |
| `POST /:id/regenerate` | master → enqueues `cv.generate-master { userId, uploadId }`; special → 409 for now (see below) |
| `DELETE /:id` (C05) | not the confirmed master in use; removes rendered files from storage |
| `GET /:id/compare` | special → its master; master → the original upload (pseudo-CV from `parsed_content`) |
| `GET /:id/download?format=` | renders once per content hash (`cv_file`), sets `page_count` |

- Verified live on the dev stack: your `cv.generate-master` output → download → real PDF.

## Asks for you

1. **C04 replace chain:** after `POST /v1/uploads/cv?replace=true` for an **onboarded** user, the spec says "the master CV is written again". The api cannot enqueue it immediately because the new upload is not parsed yet. Suggest: in `cv.parse`, when parsing succeeds and the user's onboarding is complete, enqueue `cv.generate-master { userId, uploadId }`.
2. **Special CV regenerate:** returns 409 until packs exist. When `pack.prepare` lands (M4), regenerate should enqueue it (or a `cv.generate-special` job).
3. **Profile vs CV:** the seeded demo profile (fake marketing data) wins over a real uploaded CV in `write-master-cv`. That is expected by design ("profile overrides"), but test the demo with a fresh user.

## Contract change

`downloadSchema.url` now accepts a `/v1/files/…` path as well as an absolute URL. Local storage signs links as api paths, and the old `z.url()` rejected them, which would have broken every download in the web client.
