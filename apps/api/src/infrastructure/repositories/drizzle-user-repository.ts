import type { Db } from '@job-pilot/db/client';
import { user } from '@job-pilot/db/schema/auth';
import { and, eq, isNull, lt } from 'drizzle-orm';
import type { UserRepository } from '../../application/ports/user-repository.ts';

export const createDrizzleUserRepository = (db: Db): UserRepository => ({
  findById: async (id) => {
    const [row] = await db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        timezone: user.timezone,
        theme: user.theme,
        pausedAt: user.pausedAt,
        onboardingStep: user.onboardingStep,
        onboardingCompletedAt: user.onboardingCompletedAt,
      })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    return row ?? null;
  },

  // Postgres compares enum values in declaration order (upload < confirm_profile < set_targets < schedule).
  advanceOnboarding: async (id, step) => {
    await db
      .update(user)
      .set({ onboardingStep: step })
      .where(and(eq(user.id, id), lt(user.onboardingStep, step)));
  },

  completeOnboarding: async (id, at) => {
    await db
      .update(user)
      .set({ onboardingCompletedAt: at })
      .where(and(eq(user.id, id), isNull(user.onboardingCompletedAt)));
  },
});
