# Handover: onboarding Step 2 Confirm profile (M1, Artem's item, done by Daniil)

**From:** Daniil · **To:** Artem · **Date:** 2026-11-13

`app/onboarding/[step]/confirm-profile-step.tsx` (+ css), rendered by `page.tsx` for `confirm_profile`. No api changes.

## Flow

1. `GET /v1/profile` (it includes `proof[]`), pre-filled by the CV parse job. A skeleton appears after 300 ms; `staleTime: Infinity`, so a refetch never overwrites the user's edits.
2. Continue sends one `PUT /v1/profile`: your api saves the profile and proofs, confirms it, and advances the step to `set_targets`. The links from step 1 are passed through, because the PUT requires them.
3. `setQueryData(profile)`, invalidate `me`, go to `/onboarding/set-targets`. A Back link goes to `/onboarding/upload`.

## Fields

- Full name, title, experience (required), location
- Skills (TagInput, ≤ 20)
- Salary (min/max, CZK/EUR, per month/year), notice period, languages (rows of language + level)
- Projects and proof (inline edit, add, remove, ≤ 10, ≤ 300 chars)

There is no summary field (it isn't in the DTO). Validation runs on blur and on submit, focuses the first invalid field, and shows api `fields` errors on the fields plus an error toast.

**New copy not in spec §5, please review:**

- "Max must be at least min." (the same as the api)
- "Enter a monthly or yearly amount, for example 90000."
- "Enter a number, for example 120000."
- "Enter text or remove this item."
- "Keep it under 300 characters."

## Tested

Live through :3000 (demo user set to `confirm_profile`, then restored):

- the page returns 200
- the profile loads pre-filled
- an invalid PUT returns 400 with field errors (`fullName`, `salary.max`)
- a valid PUT returns 200 (proof ids are kept, new ones assigned)
- `/v1/me` shows step `set_targets`

Web lint and typecheck pass. **Not checked in a browser:** the layout, selects, TagInput, focus and toast.
