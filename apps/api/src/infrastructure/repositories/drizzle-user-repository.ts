import type { Db } from '@job-pilot/db/client';
import { user } from '@job-pilot/db/schema/auth';
import { eq } from 'drizzle-orm';
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
});
