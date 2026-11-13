import type { Logger } from '@job-pilot/logger/logger';
import type { FileStorage } from '@job-pilot/storage/file-storage';
import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import type { DevSessionIssuer } from './application/ports/dev-session-issuer.ts';
import type { EmailPreferencesRepository } from './application/ports/email-preferences-repository.ts';
import type { JobQueue } from './application/ports/job-queue.ts';
import type { ProfileRepository } from './application/ports/profile-repository.ts';
import type { RateLimitStore } from './application/ports/rate-limit-store.ts';
import type { ScheduleRepository } from './application/ports/schedule-repository.ts';
import type { SessionReader } from './application/ports/session-reader.ts';
import type { TargetsRepository } from './application/ports/targets-repository.ts';
import type { UploadRepository } from './application/ports/upload-repository.ts';
import type { UserRepository } from './application/ports/user-repository.ts';
import type { AppEnv } from './http/app-env.ts';
import { createErrorHandler } from './http/error-handler.ts';
import { apiError } from './http/errors.ts';
import { createRateLimit, rateLimits } from './http/middleware/rate-limit.ts';
import { createRequestLogger } from './http/middleware/request-logger.ts';
import { createRequireUser } from './http/middleware/require-user.ts';
import { authBasePath } from './http/paths.ts';
import { createDevRoutes } from './http/routes/dev-routes.ts';
import { createEmailRoutes } from './http/routes/email-routes.ts';
import { createFileRoutes } from './http/routes/file-routes.ts';
import { createMeRoutes } from './http/routes/me-routes.ts';
import { createOnboardingRoutes } from './http/routes/onboarding-routes.ts';
import { createProfileRoutes } from './http/routes/profile-routes.ts';
import { createScheduleRoutes } from './http/routes/schedule-routes.ts';
import { createTargetsRoutes } from './http/routes/targets-routes.ts';
import { createUploadRoutes } from './http/routes/upload-routes.ts';

export type AppDeps = {
  log: Logger;
  /** Better Auth's fetch handler, mounted at `authBasePath`. */
  authHandler: (request: Request) => Promise<Response>;
  sessions: SessionReader;
  rateLimitStore: RateLimitStore;
  users: UserRepository;
  uploads: UploadRepository;
  profiles: ProfileRepository;
  targets: TargetsRepository;
  schedules: ScheduleRepository;
  storage: FileStorage;
  jobs: JobQueue;
  /** Clock (tests pin it; defaults to the system clock). */
  now?: () => Date;
  /** Development only: enables `POST /api/dev/sign-in`. Leave undefined in production. */
  devSessions?: DevSessionIssuer;
  /** Public one-click unsubscribe (`/v1/email/unsubscribe`). Omitted → the route is not mounted. */
  email?: { preferences: EmailPreferencesRepository; secret: string };
};

/** Builds the Hono app from its dependencies. Wiring happens in `main.ts`; tests pass fakes or test instances. */
export const createApp = (deps: AppDeps) => {
  const requireUser = createRequireUser(deps.sessions);

  const v1 = new Hono<AppEnv>()
    .use(requireUser)
    .route('/me', createMeRoutes(deps))
    .route('/uploads', createUploadRoutes(deps))
    .route('/onboarding', createOnboardingRoutes(deps))
    .route('/profile', createProfileRoutes(deps))
    .route('/targets', createTargetsRoutes(deps))
    .route('/schedule', createScheduleRoutes(deps))
    .route('/files', createFileRoutes(deps));

  const app = new Hono<AppEnv>()
    .use(requestId())
    .use(createRequestLogger(deps.log, { skipPaths: ['/health'] }))
    .use(createRateLimit(deps.rateLimitStore, rateLimits.global))
    .get('/health', (c) => c.json({ status: 'ok' as const }))
    .on(['GET', 'POST'], `${authBasePath}/*`, (c) => deps.authHandler(c.req.raw));

  // Public: registered before `/v1`, whose middleware requires a session.
  if (deps.email) {
    app.use('/v1/email/*', createRateLimit(deps.rateLimitStore, rateLimits.unsubscribe));
    app.route('/v1/email', createEmailRoutes(deps.email));
  }
  app.route('/v1', v1);
  if (deps.devSessions) app.route('/api/dev', createDevRoutes(deps.devSessions));

  return app
    .notFound((c) => apiError(c, 'not_found', 'Not found.'))
    .onError(createErrorHandler(deps.log));
};

export type AppType = ReturnType<typeof createApp>;
