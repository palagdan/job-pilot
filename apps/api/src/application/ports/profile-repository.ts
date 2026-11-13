import type { Profile, ProfileInput } from '@job-pilot/shared/profile';

export type ProfileFields = Omit<ProfileInput, 'proof'>;

export interface ProfileRepository {
  /** Null when the user has no profile row yet (before the CV is parsed). */
  get(userId: string): Promise<(Profile & { confirmedAt: Date | null }) | null>;
  /**
   * Upserts the given fields (others unchanged). `proof`, when given, replaces the whole "Projects and proof" list.
   * `confirm` sets `confirmedAt` (onboarding step 2).
   */
  save(
    userId: string,
    fields: Partial<ProfileFields>,
    options?: { proof?: ProfileInput['proof']; confirm?: boolean },
  ): Promise<Profile>;
}
