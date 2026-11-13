import type { Db } from '@job-pilot/db/client';
import { user } from '@job-pilot/db/schema/auth';
import { schedule } from '@job-pilot/db/schema/profile';
import { eq } from 'drizzle-orm';
import type { EmailPreferencesRepository } from '../../application/ports/email-preferences-repository.ts';

export const createDrizzleEmailPreferencesRepository = (db: Db): EmailPreferencesRepository => ({
  unsubscribe: (userId) =>
    db.transaction(async (tx) => {
      const updated = await tx
        .update(user)
        .set({ emailUnsubscribedAt: new Date() })
        .where(eq(user.id, userId))
        .returning({ id: user.id });
      if (updated.length === 0) return false;
      // The schedule row has defaults for everything else, so it can be created just to hold the flag.
      await tx
        .insert(schedule)
        .values({ userId, notifyEmail: false })
        .onConflictDoUpdate({ target: schedule.userId, set: { notifyEmail: false } });
      return true;
    }),
});
