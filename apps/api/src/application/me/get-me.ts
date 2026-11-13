import type { Me } from '@job-pilot/shared/user';
import type { UserRepository } from '../ports/user-repository.ts';

export type GetMeDeps = { users: UserRepository };

/** GET /v1/me. Returns null when the session points to a user that no longer exists. */
export const getMe = async ({ users }: GetMeDeps, userId: string): Promise<Me | null> => {
  const user = await users.findById(userId);
  if (!user) return null;
  return {
    ...user,
    pausedAt: user.pausedAt?.toISOString() ?? null,
    onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
  };
};
