import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import type { SessionReader } from './application/ports/session-reader.ts';
import type { UserRepository } from './application/ports/user-repository.ts';
import type { AppEnv } from './http/app-env.ts';
import { apiError } from './http/errors.ts';
import { createRequireUser } from './http/middleware/require-user.ts';
import { authBasePath } from './http/paths.ts';
import { createMeRoutes } from './http/routes/me-routes.ts';

export type AppDeps = {
  /** Better Auth's fetch handler, mounted at `authBasePath`. */
  authHandler: (request: Request) => Promise<Response>;
  sessions: SessionReader;
  users: UserRepository;
};

/** Builds the Hono app from its dependencies. Wiring happens in `main.ts`; tests pass fakes or test instances. */
export const createApp = (deps: AppDeps) => {
  const requireUser = createRequireUser(deps.sessions);

  const v1 = new Hono<AppEnv>().use(requireUser).route('/me', createMeRoutes(deps));

  return new Hono<AppEnv>()
    .use(requestId())
    .get('/health', (c) => c.json({ status: 'ok' as const }))
    .on(['GET', 'POST'], `${authBasePath}/*`, (c) => deps.authHandler(c.req.raw))
    .route('/v1', v1)
    .notFound((c) => apiError(c, 'not_found', 'Not found.'));
};

export type AppType = ReturnType<typeof createApp>;
