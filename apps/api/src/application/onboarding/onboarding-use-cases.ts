import { AppError } from '@job-pilot/shared/errors';
import { messages } from '@job-pilot/shared/limits';
import { nextRunAt } from '@job-pilot/shared/next-run';
import type { Me } from '@job-pilot/shared/user';
import { getMe } from '../me/get-me.ts';
import type { JobQueue } from '../ports/job-queue.ts';
import type { ProfileRepository } from '../ports/profile-repository.ts';
import type { ScheduleRepository } from '../ports/schedule-repository.ts';
import type { TargetsRepository } from '../ports/targets-repository.ts';
import type { UploadRepository } from '../ports/upload-repository.ts';
import type { UserRepository } from '../ports/user-repository.ts';
import { advancePast, assertStepReached, loadUser } from './onboarding-rules.ts';

/** The current CV must be read before the user can move on (spec: "Continue is disabled until a CV is uploaded and parsed"). */
const requireParsedCv = async (uploads: UploadRepository, userId: string) => {
  const cv = await uploads.findCurrentCv(userId);
  if (!cv)
    throw new AppError('validation_failed', messages.cvRequired, { file: messages.cvRequired });
  if (cv.parseStatus === 'failed')
    throw new AppError('cv_unreadable', cv.parseError ?? messages.cvUnreadable);
  if (cv.parseStatus !== 'parsed')
    throw new AppError('conflict', 'We are still reading your CV. Try again in a few seconds.');
  return cv;
};

/** PUT /v1/onboarding/links — step 1 "Continue": saves the LinkedIn / portfolio links, moves to step 2. */
export async function saveOnboardingLinks(
  deps: { users: UserRepository; uploads: UploadRepository; profiles: ProfileRepository },
  userId: string,
  links: { linkedinUrl: string | null; portfolioUrl: string | null },
): Promise<void> {
  const user = await loadUser(deps.users, userId);
  await requireParsedCv(deps.uploads, userId);
  await deps.profiles.save(userId, links);
  await advancePast(deps.users, user, 'upload');
}

/**
 * POST /v1/onboarding/complete — after step 4. Checks every step is saved, marks onboarding done, sets the first
 * run and asks the worker to write the master CV (then the "Agent is live" email). Idempotent.
 */
export async function completeOnboarding(
  deps: {
    users: UserRepository;
    uploads: UploadRepository;
    profiles: ProfileRepository;
    targets: TargetsRepository;
    schedules: ScheduleRepository;
    jobs: JobQueue;
    now?: () => Date;
  },
  userId: string,
): Promise<Me> {
  const user = await loadUser(deps.users, userId);
  if (!user.onboardingCompletedAt) {
    assertStepReached(user, 'schedule');
    const cv = await requireParsedCv(deps.uploads, userId);
    const profile = await deps.profiles.get(userId);
    if (!profile?.confirmedAt) throw new AppError('conflict', 'Confirm your profile first.');
    if (!(await deps.targets.get(userId)))
      throw new AppError('conflict', 'Set your targets first.');
    const schedule = await deps.schedules.get(userId);
    if (!schedule) throw new AppError('conflict', 'Pick a schedule first.');

    const now = (deps.now ?? (() => new Date()))();
    await deps.users.completeOnboarding(userId, now);
    await deps.schedules.setNextRunAt(
      userId,
      nextRunAt({ ...schedule, timezone: user.timezone }, now, schedule.lastRunAt),
    );
    await deps.jobs.enqueueGenerateMasterCv(userId, cv.id);
  }
  const me = await getMe(deps, userId);
  if (!me) throw new AppError('unauthorized', 'Sign in to continue.');
  return me;
}
