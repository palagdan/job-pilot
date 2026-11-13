import { redirect } from 'next/navigation';
import { onboardingPath } from '../../lib/onboarding/steps.ts';
import { requireUser } from '../../lib/session/get-session-user.ts';

/** /onboarding → the user's current step (resumable; also the target for first sign-in). */
export default async function OnboardingIndex() {
  const me = await requireUser({ onboarded: false });
  redirect(onboardingPath(me.onboardingStep));
}
