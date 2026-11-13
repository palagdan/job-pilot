import { type OnboardingStep, onboardingSteps } from '@job-pilot/shared/enums';

/** URL slugs for onboarding steps: /onboarding/upload, /onboarding/confirm-profile, ... */
export const stepSlug = (step: OnboardingStep) => step.replace('_', '-');

export const stepFromSlug = (slug: string): OnboardingStep | null =>
  onboardingSteps.find((s) => stepSlug(s) === slug) ?? null;

export const stepIndex = (step: OnboardingStep) => onboardingSteps.indexOf(step);

export const stepLabels: Record<OnboardingStep, string> = {
  upload: 'Upload',
  confirm_profile: 'Confirm profile',
  set_targets: 'Set targets',
  schedule: 'Schedule',
};

export const onboardingPath = (step: OnboardingStep) => `/onboarding/${stepSlug(step)}`;

/**
 * Where a signed-in user belongs: unfinished onboarding → their current step; otherwise `next`.
 * Steps before the current one may be revisited (resumable, can go back), later ones may not.
 */
export const destinationFor = (me: { onboardingCompletedAt: string | null; onboardingStep: OnboardingStep }, next: string) =>
  me.onboardingCompletedAt ? next : onboardingPath(me.onboardingStep);
