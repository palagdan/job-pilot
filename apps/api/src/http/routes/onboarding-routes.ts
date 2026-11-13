import { routes } from '@job-pilot/shared/routes';
import { Hono } from 'hono';
import {
  completeOnboarding,
  saveOnboardingLinks,
} from '../../application/onboarding/onboarding-use-cases.ts';
import type { JobQueue } from '../../application/ports/job-queue.ts';
import type { ProfileRepository } from '../../application/ports/profile-repository.ts';
import type { ScheduleRepository } from '../../application/ports/schedule-repository.ts';
import type { TargetsRepository } from '../../application/ports/targets-repository.ts';
import type { UploadRepository } from '../../application/ports/upload-repository.ts';
import type { UserRepository } from '../../application/ports/user-repository.ts';
import type { AppEnv } from '../app-env.ts';
import { validate } from '../validate.ts';

export type OnboardingRoutesDeps = {
  users: UserRepository;
  uploads: UploadRepository;
  profiles: ProfileRepository;
  targets: TargetsRepository;
  schedules: ScheduleRepository;
  jobs: JobQueue;
  now?: () => Date;
};

export const createOnboardingRoutes = (deps: OnboardingRoutesDeps) =>
  new Hono<AppEnv>()
    .put('/links', validate('json', routes.saveOnboardingLinks.body), async (c) => {
      await saveOnboardingLinks(deps, c.var.user.id, c.req.valid('json'));
      return c.json({ ok: true as const });
    })
    .post('/complete', async (c) => c.json(await completeOnboarding(deps, c.var.user.id)));
