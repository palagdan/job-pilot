import type { Logger } from '@job-pilot/logger/logger';
import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import type { RateLimitStore } from './application/ports/rate-limit-store.ts';
import type { SessionReader } from './application/ports/session-reader.ts';
import type { UserRepository } from './application/ports/user-repository.ts';
import type { AppEnv } from './http/app-env.ts';
import { createErrorHandler } from './http/error-handler.ts';
import { apiError } from './http/errors.ts';
import { createRateLimit, rateLimits } from './http/middleware/rate-limit.ts';
import { createRequestLogger } from './http/middleware/request-logger.ts';
import { createRequireUser } from './http/middleware/require-user.ts';
import { authBasePath } from './http/paths.ts';
import { createMeRoutes } from './http/routes/me-routes.ts';

export type AppDeps = {
  log: Logger;
  /** Better Auth's fetch handler, mounted at `authBasePath`. */
  authHandler: (request: Request) => Promise<Response>;
  sessions: SessionReader;
  rateLimitStore: RateLimitStore;
  users: UserRepository;
};

/** Builds the Hono app from its dependencies. Wiring happens in `main.ts`; tests pass fakes or test instances. */
export const createApp = (deps: AppDeps) => {
  const requireUser = createRequireUser(deps.sessions);

  const v1 = new Hono<AppEnv>().use(requireUser).route('/me', createMeRoutes(deps));

  return new Hono<AppEnv>()
    .use(requestId())
    .use(createRequestLogger(deps.log, { skipPaths: ['/health'] }))
    .use(createRateLimit(deps.rateLimitStore, rateLimits.global))
    .get('/health', (c) => c.json({ status: 'ok' as const }))
    .on(['GET', 'POST'], `${authBasePath}/*`, (c) => deps.authHandler(c.req.raw))
    .route('/v1', v1)
    .notFound((c) => apiError(c, 'not_found', 'Not found.'))
    .onError(createErrorHandler(deps.log));
};

export type AppType = ReturnType<typeof createApp>;
