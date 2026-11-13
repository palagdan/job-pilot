import { type OnboardingStep, onboardingSteps } from '@job-pilot/shared/enums';
import { AppError } from '@job-pilot/shared/errors';
import type { User, UserRepository } from '../ports/user-repository.ts';

const index = (step: OnboardingStep) => onboardingSteps.indexOf(step);

/** Loads the signed-in user (a session for a deleted user counts as signed out). */
export async function loadUser(users: UserRepository, userId: string): Promise<User> {
  const user = await users.findById(userId);
  if (!user) throw new AppError('unauthorized', 'Sign in to continue.');
  return user;
}

/**
 * During onboarding a step's data can be saved only once the user has reached that step (no skipping ahead
 * through the api). After onboarding everything is editable (Profile and targets page).
 */
export function assertStepReached(user: User, step: OnboardingStep): void {
  if (user.onboardingCompletedAt) return;
  if (index(user.onboardingStep) < index(step)) {
    throw new AppError('conflict', 'Finish the previous onboarding step first.');
  }
}

/** After saving `step`, move the user to the following step (forward only; no-op once onboarding is done). */
export async function advancePast(
  users: UserRepository,
  user: User,
  step: OnboardingStep,
): Promise<void> {
  if (user.onboardingCompletedAt) return;
  const next = onboardingSteps[index(step) + 1];
  if (next) await users.advanceOnboarding(user.id, next);
}
