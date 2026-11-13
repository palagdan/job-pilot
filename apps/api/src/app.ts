import type { Logger } from '@job-pilot/logger/logger';
import type { FileStorage } from '@job-pilot/storage/file-storage';
import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import type { AgentRepository } from './application/ports/agent-repository.ts';
import type { AgentRunRepository } from './application/ports/agent-run-repository.ts';
import type { CvFactsReader } from './application/ports/cv-facts-reader.ts';
import type { CvFileRepository } from './application/ports/cv-file-repository.ts';
import type { CvRenderer } from './application/ports/cv-renderer.ts';
import type { CvRepository } from './application/ports/cv-repository.ts';
import type { DevSessionIssuer } from './application/ports/dev-session-issuer.ts';
import type { EmailPreferencesRepository } from './application/ports/email-preferences-repository.ts';
import type { AgentJobQueue, JobQueue } from './application/ports/job-queue.ts';
import type { OpsReader } from './application/ports/ops-reader.ts';
import type { PipelineRepository } from './application/ports/pipeline-repository.ts';
import type { ProfileRepository } from './application/ports/profile-repository.ts';
import type { PushSubscriptionRepository } from './application/ports/push-subscription-repository.ts';
import type { RateLimitStore } from './application/ports/rate-limit-store.ts';
import type { ReviewRepository } from './application/ports/review-repository.ts';
import type { ScheduleRepository } from './application/ports/schedule-repository.ts';
import type { SessionReader } from './application/ports/session-reader.ts';
import type { TargetsRepository } from './application/ports/targets-repository.ts';
import type { TodayRepository } from './application/ports/today-repository.ts';
import type { UploadRepository } from './application/ports/upload-repository.ts';
import type { UserRepository } from './application/ports/user-repository.ts';
import type { AppEnv } from './http/app-env.ts';
import { createErrorHandler } from './http/error-handler.ts';
import { apiError } from './http/errors.ts';
import { createRateLimit, rateLimits } from './http/middleware/rate-limit.ts';
import { createRequestLogger } from './http/middleware/request-logger.ts';
import { createRequireUser } from './http/middleware/require-user.ts';
import { authBasePath } from './http/paths.ts';
import { createAdminRoutes } from './http/routes/admin-routes.ts';
import { createAgentRoutes } from './http/routes/agent-routes.ts';
import { createCvRoutes } from './http/routes/cv-routes.ts';
import { createDevRoutes } from './http/routes/dev-routes.ts';
import { createEmailRoutes } from './http/routes/email-routes.ts';
import { createFileRoutes } from './http/routes/file-routes.ts';
import { createFollowUpRoutes } from './http/routes/follow-up-routes.ts';
import { createMeRoutes } from './http/routes/me-routes.ts';
import { createOnboardingRoutes } from './http/routes/onboarding-routes.ts';
import { createOpportunityRoutes } from './http/routes/opportunity-routes.ts';
import { createPipelineRoutes } from './http/routes/pipeline-routes.ts';
import { createProfileRoutes } from './http/routes/profile-routes.ts';
import { createPushRoutes } from './http/routes/push-routes.ts';
import {
  createDraftRoutes,
  createReviewItemRoutes,
  createReviewListRoutes,
} from './http/routes/review-routes.ts';
import { createScheduleRoutes } from './http/routes/schedule-routes.ts';
import { createSuggestionRoutes } from './http/routes/suggestion-routes.ts';
import { createTargetsRoutes } from './http/routes/targets-routes.ts';
import { createTodayRoutes } from './http/routes/today-routes.ts';
import { createUndoRoutes } from './http/routes/undo-routes.ts';
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
  cvFacts: CvFactsReader;
  cvs: CvRepository;
  agent: AgentRepository;
  pipeline: PipelineRepository;
  ops: OpsReader;
  /** Lower-case emails allowed to see /v1/admin (`ADMIN_EMAILS`). */
  admins: readonly string[];
  pushSubscriptions: PushSubscriptionRepository;
  /** VAPID public key; undefined = push disabled. */
  vapidPublicKey?: string;
  cvFiles: CvFileRepository;
  renderer: CvRenderer;
  storage: FileStorage;
  jobs: JobQueue;
  agentJobs: AgentJobQueue;
  today: TodayRepository;
  review: ReviewRepository;
  agentRuns: AgentRunRepository;
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
    .route('/suggestions', createSuggestionRoutes(deps))
    .route('/cvs', createCvRoutes(deps))
    .route('/files', createFileRoutes(deps))
    .route('/today', createTodayRoutes(deps))
    .route('/opportunities', createOpportunityRoutes(deps))
    .route('/undo', createUndoRoutes(deps))
    .route('/pipeline', createPipelineRoutes(deps))
    .route('/follow-ups', createFollowUpRoutes(deps))
    .route('/push', createPushRoutes({ ...deps, vapidPublicKey: deps.vapidPublicKey }))
    .route('/pipeline', createReviewItemRoutes(deps))
    .route('/review', createReviewListRoutes(deps))
    .route('/drafts', createDraftRoutes(deps))
    .route('/admin', createAdminRoutes(deps))
    .route('/agent', createAgentRoutes({ ...deps, runs: deps.agentRuns }));

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
