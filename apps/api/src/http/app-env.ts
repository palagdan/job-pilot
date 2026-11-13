import type { RequestIdVariables } from 'hono/request-id';
import type { SessionUser } from '../application/ports/session-reader.ts';

/** Hono context variables. `user` is set by `requireUser` on protected routes. */
export type AppEnv = {
  Variables: RequestIdVariables & {
    user: SessionUser;
  };
};
