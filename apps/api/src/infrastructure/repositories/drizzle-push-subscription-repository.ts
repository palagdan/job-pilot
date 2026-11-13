import type { Db } from '@job-pilot/db/client';
import { pushSubscription } from '@job-pilot/db/schema/notifications';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { PushSubscriptionRepository } from '../../application/ports/push-subscription-repository.ts';

export const createDrizzlePushSubscriptionRepository = (db: Db): PushSubscriptionRepository => ({
  upsert: (userId, input, maxPerUser) =>
    db.transaction(async (tx) => {
      await tx
        .insert(pushSubscription)
        .values({ userId, ...input })
        .onConflictDoUpdate({
          target: pushSubscription.endpoint,
          set: {
            userId,
            p256dh: input.p256dh,
            auth: input.auth,
            userAgent: input.userAgent,
            failedAt: null,
          },
        });
      const live = await tx
        .select({ id: pushSubscription.id })
        .from(pushSubscription)
        .where(and(eq(pushSubscription.userId, userId), isNull(pushSubscription.failedAt)))
        .orderBy(desc(pushSubscription.updatedAt), desc(pushSubscription.createdAt));
      const extra = live.slice(maxPerUser).map((r) => r.id);
      if (extra.length)
        await tx.delete(pushSubscription).where(inArray(pushSubscription.id, extra));
    }),

  remove: async (userId, endpoint) => {
    await db
      .delete(pushSubscription)
      .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)));
  },
});
