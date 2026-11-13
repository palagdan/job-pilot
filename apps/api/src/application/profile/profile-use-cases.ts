import { AppError } from '@job-pilot/shared/errors';
import type { Profile, ProfileInput, ProfilePatch } from '@job-pilot/shared/profile';
import { advancePast, assertStepReached, loadUser } from '../onboarding/onboarding-rules.ts';
import type { ProfileRepository } from '../ports/profile-repository.ts';
import type { UserRepository } from '../ports/user-repository.ts';

type Deps = { profiles: ProfileRepository; users: UserRepository };

const empty: Profile = {
  fullName: null,
  currentTitle: null,
  experience: null,
  location: null,
  linkedinUrl: null,
  portfolioUrl: null,
  skills: [],
  salary: null,
  noticePeriod: null,
  languages: [],
  proof: [],
};

/** GET /v1/profile — pre-filled by the cv.parse job; empty before that. */
export async function getProfile(deps: Deps, userId: string): Promise<Profile> {
  const found = await deps.profiles.get(userId);
  if (!found) return empty;
  const { confirmedAt: _, ...profile } = found;
  return profile;
}

/** PUT /v1/profile — onboarding step 2 "Confirm profile": saves everything, confirms, moves to step 3. */
export async function putProfile(
  deps: Deps,
  userId: string,
  input: ProfileInput,
): Promise<Profile> {
  const user = await loadUser(deps.users, userId);
  assertStepReached(user, 'confirm_profile');
  const { proof, ...fields } = input;
  const saved = await deps.profiles.save(userId, fields, { proof, confirm: true });
  await advancePast(deps.users, user, 'confirm_profile');
  return saved;
}

/** PATCH /v1/profile — per-section save on "Profile and targets" (after the profile was confirmed once). */
export async function patchProfile(
  deps: Deps,
  userId: string,
  patch: ProfilePatch,
): Promise<Profile> {
  const user = await loadUser(deps.users, userId);
  assertStepReached(user, 'confirm_profile');
  const { proof, ...fields } = patch;
  if (Object.keys(fields).length === 0 && !proof)
    throw new AppError('validation_failed', 'Nothing to save.');
  return deps.profiles.save(userId, fields, { proof });
}
