/** Counts hits per key in fixed windows. In-memory for one api process; swap for Postgres/Redis when scaling out. */
export interface RateLimitStore {
  /** Registers one hit and returns the count in the current window and when the window resets (epoch ms). */
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}
