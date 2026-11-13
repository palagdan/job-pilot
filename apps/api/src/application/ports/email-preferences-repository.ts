export interface EmailPreferencesRepository {
  /** Turns off all notification emails for the user. Returns false when the user does not exist. */
  unsubscribe(userId: string): Promise<boolean>;
}
