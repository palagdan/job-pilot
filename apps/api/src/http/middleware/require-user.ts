import { createMiddleware } from 'hono/factory';
import type { SessionReader } from '../../application/ports/session-reader.ts';
import type { AppEnv } from '../app-env.ts';
import { apiError } from '../errors.ts';

/**
 * Rejects requests without a valid session with 401 `unauthorized` (web shows E03 "You were signed out").
 * On success sets `c.var.user`; handlers scope every query by `c.var.user.id`.
 */
export const createRequireUser = (sessions: SessionReader) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const user = await sessions.read(c.req.raw.headers);
    if (!user) return apiError(c, 'unauthorized', 'Sign in to continue.');
    c.set('user', user);
    await next();
  });
