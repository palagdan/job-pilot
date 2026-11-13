# Handover: CV screens + Profile and targets (M2, Artem)

**From:** Artem · **To:** Daniil · **Date:** 2026-11-13

## Heads-up: your onboarding forms moved (behaviour unchanged)

Page 11 "Profile and targets" uses the same controls as onboarding steps 2–4 (spec §1), so the forms are shared now:

| Before | Now |
| --- | --- |
| `app/onboarding/[step]/confirm-profile-step.tsx` | `components/forms/profile-form.tsx` (`ProfileForm`) + a thin step wrapper |
| `app/onboarding/[step]/set-targets-step.tsx` | `components/forms/targets-form.tsx` (`TargetsForm`) + wrapper |
| `app/onboarding/[step]/schedule-step.tsx` | `components/forms/schedule-form.tsx` (`ScheduleForm`) + wrapper |

- `git mv` was used, so history and blame follow the files.
- The forms take `onSaved`, `submitLabel`, `loadingLabel` and `footer`. `onSaved` runs inside the mutation, so the button stays loading until the follow-up finishes.
- The step wrappers keep your cards, skeletons, error copy and Back links, and handle navigation.
- `completeOnboarding` moved from `ScheduleForm` into the schedule step's `onSaved`. After finishing setup the user now lands on **`/cvs/new`** (06), not `/cvs`.

## New screens

- **06 `/cvs/new`** (no sidebar, route group `(focus)`): polls while the master is `generating`; E05 on `failed` (Use my original / Try again); preview, What changed, original download; C02 confirm / C03 keep original → Today.
- **09 `/cvs`**:
  - master card, original upload, special CVs list, "Upload new CV" (C04)
  - CV actions menu per the spec rules
  - `/cvs/[id]` view + "Edit text" (C08 on leave)
  - `/cvs/[id]/compare` side-by-side diff
  - E08 download fallback to DOCX
- **11 `/profile`**: the three forms, each with its own save, and the next run in the schedule header.

## Also

- `@job-pilot/shared/cv-format` now holds the CV text formatting (moved from cv-render), so the PDF, the DOCX and the web preview read the same.
- Not done: the "added from chat — Undo" chip on page 11. It needs the chat/activity undo flow (your M5).
