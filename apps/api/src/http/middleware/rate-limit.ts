import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { RateLimitStore } from '../../application/ports/rate-limit-store.ts';
import type { AppEnv } from '../app-env.ts';
import { apiError } from '../errors.ts';

export type RateLimitRule = {
  /** Bucket name, e.g. "global", "upload", "chat", "run-now". */
  name: string;
  max: number;
  windowMs: number;
  /** `user` needs `requireUser` before it; falls back to IP when there is no user. */
  by: 'ip' | 'user';
};

/** Client IP. Behind the Next proxy the first `x-forwarded-for` entry is the browser. */
const clientIp = (c: Context<AppEnv>): string => {
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
};

/** Over the limit → 429 `rate_limited` (E11) with `Retry-After`. Sets `RateLimit-*` headers on every response. */
export const createRateLimit = (store: RateLimitStore, rule: RateLimitRule) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const subject =
      rule.by === 'user' && c.get('user') ? `u:${c.get('user').id}` : `ip:${clientIp(c)}`;
    const { count, resetAt } = await store.hit(`${rule.name}:${subject}`, rule.windowMs);
    const resetSeconds = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));

    c.header('RateLimit-Limit', String(rule.max));
    c.header('RateLimit-Remaining', String(Math.max(0, rule.max - count)));
    c.header('RateLimit-Reset', String(resetSeconds));

    if (count > rule.max) {
      c.header('Retry-After', String(resetSeconds));
      return apiError(
        c,
        'rate_limited',
        'Too many requests in a short time. Wait a minute and try again.',
      );
    }
    await next();
  });

/** Limits used across the api. Endpoint-specific ones are applied where those endpoints are added. */
export const rateLimits = {
  /** Everything, per IP. Generous: only stops floods. */
  global: { name: 'global', max: 600, windowMs: 60_000, by: 'ip' },
  /** CV upload (M1). */
  upload: { name: 'upload', max: 10, windowMs: 10 * 60_000, by: 'user' },
  /** Chat messages (M5). */
  chat: { name: 'chat', max: 30, windowMs: 60_000, by: 'user' },
  /** Public one-click unsubscribe, per IP. */
  unsubscribe: { name: 'unsubscribe', max: 20, windowMs: 60_000, by: 'ip' },
  /** "Run now" (M3). */
  runNow: { name: 'run-now', max: 5, windowMs: 60 * 60_000, by: 'user' },
} as const satisfies Record<string, RateLimitRule>;
