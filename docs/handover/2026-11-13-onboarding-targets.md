# Handover: onboarding Step 3 Set targets (M1, Artem's item, done by Daniil)

**From:** Daniil · **To:** Artem · **Date:** 2026-11-13

`app/onboarding/[step]/set-targets-step.tsx` (+ css), rendered for `set_targets`. No api changes.

## Flow

1. `GET /v1/targets` (it returns the defaults before the first save; empty `workFormats` falls back to `targetsDefaults`).
2. `GET /v1/suggestions` per field: `q=''` for the chips, the typed text for the TagInput dropdown.
3. Continue sends `PUT /v1/targets` (which advances the step to `schedule`), invalidates `me`, sets the targets query data, and goes to `/onboarding/schedule`. Back goes to `/onboarding/confirm-profile`.

## Suggestions: your `feat/suggestions` branch

- Built against your response shape `{ items: string[] }` (`kind=roles|locations|skills`, `q`).
- Until it's merged, `/v1/suggestions` returns 404. Because of `retry: false` and `data ?? []`, the screen just shows no suggestions.
- "Remote EU" and "Remote worldwide" are always offered as location chips, even without your endpoint.
- `SuggestionKind` isn't exported on main, so the step uses `(typeof suggestionKinds)[number]`. Swap in your export when it lands.

## Validation

- Uses `messages.rolesRequired`, `locationsRequired`, `workFormatRequired`, `lookForRequired` and `tagLimit`.
- The Jobs/Events error is keyed `findJobs`, like the api's `fields`.
- The work-format chips can't all be turned off (`minSelected={1}`).
- API `fields` errors show on the fields, plus an error toast.

New copy (titles, hints, placeholders, "Suggestions", errors) is in the component. Please review.

## Tested

Live through :3000 (demo user set to `set_targets`, then restored; targets restored):

- the page returns 200
- suggestions return 404 and the screen tolerates it
- invalid PUTs return 400 (`roles`, `workFormats`, `findJobs`) and the step doesn't advance
- a valid PUT returns 200 and the step becomes `schedule`

Web lint and typecheck pass. **Not checked in a browser:** the layout, the dropdown/chips with real suggestions, keyboard use and the redirect.
