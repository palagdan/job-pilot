import type { Logger } from '@job-pilot/logger/logger';
import type { RequestIdVariables } from 'hono/request-id';
import type { SessionUser } from '../application/ports/session-reader.ts';

/** Hono context variables. `log` is per request (has `requestId`); `user` is set by `requireUser`. */
export type AppEnv = {
  Variables: RequestIdVariables & {
    log: Logger;
    user: SessionUser;
  };
};
