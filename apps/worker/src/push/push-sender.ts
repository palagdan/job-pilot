import webpush from 'web-push';

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/** What the push service said: delivered, gone (404/410: the subscription is dead), or failed (retry later). */
export type PushOutcome = 'sent' | 'gone' | 'failed';

export type PushSender = (target: PushTarget, payload: string) => Promise<PushOutcome>;

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

/** Web Push adapter (VAPID). Message TTL 1 day: a "pack ready" push older than that is not worth showing. */
export const createWebPushSender = (vapid: VapidConfig): PushSender => {
  const vapidDetails = {
    subject: vapid.subject,
    publicKey: vapid.publicKey,
    privateKey: vapid.privateKey,
  };
  return async (target, payload) => {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        payload,
        { vapidDetails, TTL: 86_400, timeout: 10_000 },
      );
      return 'sent';
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      return status === 404 || status === 410 ? 'gone' : 'failed';
    }
  };
};
