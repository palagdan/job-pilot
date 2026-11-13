import type { RateLimitStore } from '../../application/ports/rate-limit-store.ts';

/** Fixed-window counter in process memory. Expired windows are swept every minute. */
export const createMemoryRateLimitStore = (
  now: () => number = Date.now,
): RateLimitStore & { stop(): void } => {
  const windows = new Map<string, { count: number; resetAt: number }>();
  const sweep = setInterval(() => {
    const t = now();
    for (const [key, w] of windows) if (w.resetAt <= t) windows.delete(key);
  }, 60_000);
  sweep.unref();

  return {
    hit: async (key, windowMs) => {
      const t = now();
      const current = windows.get(key);
      if (!current || current.resetAt <= t) {
        const fresh = { count: 1, resetAt: t + windowMs };
        windows.set(key, fresh);
        return { ...fresh };
      }
      current.count += 1;
      return { ...current };
    },
    stop: () => clearInterval(sweep),
  };
};
