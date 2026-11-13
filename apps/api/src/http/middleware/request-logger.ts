import type { Logger } from '@job-pilot/logger/logger';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../app-env.ts';

/** Gives each request a child logger (`c.var.log`, bound to `requestId`) and logs one line when it finishes. */
export const createRequestLogger = (log: Logger, options: { skipPaths?: string[] } = {}) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const requestLog = log.child({ requestId: c.get('requestId') });
    c.set('log', requestLog);
    const started = performance.now();
    await next();
    if (options.skipPaths?.includes(c.req.path)) return;
    const fields = {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - started),
      userId: c.get('user')?.id,
    };
    if (c.res.status >= 500) requestLog.error('request failed', fields);
    else requestLog.info('request', fields);
  });
