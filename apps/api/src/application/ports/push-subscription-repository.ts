export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
};

export interface PushSubscriptionRepository {
  /**
   * Saves the browser's subscription for the user. An endpoint already known (same browser, maybe another account)
   * moves to this user and is revived. Keeps at most `maxPerUser` live rows (oldest dropped).
   */
  upsert(userId: string, input: PushSubscriptionInput, maxPerUser: number): Promise<void>;
  remove(userId: string, endpoint: string): Promise<void>;
}
