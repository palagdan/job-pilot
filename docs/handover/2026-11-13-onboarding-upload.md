# Handover: onboarding Step 1 Upload (M1, Artem's item, done by Daniil)

**From:** Daniil · **To:** Artem · **Date:** 2026-11-13

I built `Onboarding stepper + resumable progress; Step 1 Upload` while you work on suggestions. It is built on your components, API client and step routing. Steps 2–4 still show your placeholder.

## Web

- `app/onboarding/[step]/upload-step.tsx` (+ `.module.css`). `page.tsx` renders it for the `upload` step; the server page still does auth and redirects.
- **Dropzone:** a client check via `checkCvFile` (type, ≤ 5 MB), then an XHR upload with progress (`lib/api/upload-cv.ts`, which throws your `ApiError`). It polls `GET /v1/uploads/current` every 1.5 s while the CV is pending, extracting or parsing ("Reading your CV…"). It ends either done (filename, page count, Replace) or in error (`parseError` = E04 copy, Replace). Replace sends `?replace=true`.
- **Links:** LinkedIn (linkedin.com only) and GitHub/portfolio, both optional and validated on blur and on Continue. They are pre-filled from the profile, and `https://` is added when missing.
- **Continue:** disabled until `parsed`. It calls `PUT /v1/onboarding/links` (which advances `onboardingStep` to `confirm_profile`), invalidates `me`, and goes to `/onboarding/confirm-profile`.
- **Resumable:** after a reload, the current upload is shown in whatever state it is in, and polling resumes.
- All copy comes from `messages.*` in `shared/limits.ts`.

## api (one small addition)

- `GET /v1/uploads/current` returns the user's current CV upload or `null`. The contract `getCurrentUpload` is in `routes.ts` (owner daniil). It is built on your existing `findCurrentCv`, so no port or repository changes; the route is registered before `/:id`. There is one integration test.

## Tested

- Live through :3000 with the demo user temporarily set back to step `upload`:
  - dev sign-in → `/onboarding/upload` returns 200
  - `/v1/uploads/current` returns `null`
  - uploading a PDF returns 201 `pending`, then the real worker took it to `parsed` in about 12 s
  - links saved → `/v1/me` shows step `confirm_profile`
- Web lint and typecheck pass; api 48/48 tests pass.
- **Not checked in a real browser:** the drag-over, percent, error and keyboard states (your Dropzone component handles them).
- **Local data side effect:** the demo user's profile links now hold test values, and their current CV is the test PDF. Re-seed if that matters.
