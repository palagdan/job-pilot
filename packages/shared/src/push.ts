import { z } from 'zod';

/** Browser `PushSubscription.toJSON()`. */
export const pushSubscriptionInputSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export const vapidKeySchema = z.object({ publicKey: z.string() });
