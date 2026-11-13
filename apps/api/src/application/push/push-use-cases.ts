import { AppError } from '@job-pilot/shared/errors';
import type { PushSubscriptionRepository } from '../ports/push-subscription-repository.ts';

export type PushDeps = {
  pushSubscriptions: PushSubscriptionRepository;
  /** VAPID public key; undefined = push not configured on this server. */
  vapidPublicKey: string | undefined;
};

/** One subscription per browser; a user rarely has more than a few devices. */
export const MAX_PUSH_SUBSCRIPTIONS = 10;

/** GET /v1/push/vapid-key — 404 when push is not set up (the web then says push is unavailable). */
export function getVapidKey(deps: Pick<PushDeps, 'vapidPublicKey'>) {
  if (!deps.vapidPublicKey)
    throw new AppError('not_found', 'Push notifications are not available.');
  return { publicKey: deps.vapidPublicKey };
}

/** POST /v1/push/subscriptions — after the browser granted permission. Idempotent. */
export async function subscribePush(
  deps: PushDeps,
  userId: string,
  input: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string | null,
) {
  getVapidKey(deps);
  await deps.pushSubscriptions.upsert(
    userId,
    {
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: userAgent?.slice(0, 300) ?? null,
    },
    MAX_PUSH_SUBSCRIPTIONS,
  );
  return { ok: true as const };
}

/** DELETE /v1/push/subscriptions — this browser stops receiving pushes. Idempotent. */
export async function unsubscribePush(
  deps: Pick<PushDeps, 'pushSubscriptions'>,
  userId: string,
  endpoint: string,
) {
  await deps.pushSubscriptions.remove(userId, endpoint);
  return { ok: true as const };
}
