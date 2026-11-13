import { onboardingSteps } from '@job-pilot/shared/enums';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Stepper } from '../../../components/ui/stepper.tsx';
import { onboardingPath, stepFromSlug, stepIndex, stepLabels } from '../../../lib/onboarding/steps.ts';
import { requireUser } from '../../../lib/session/get-session-user.ts';
import styles from '../onboarding.module.css';
import { ConfirmProfileStep } from './confirm-profile-step.tsx';
import { SetTargetsStep } from './set-targets-step.tsx';
import { UploadStep } from './upload-step.tsx';

export const metadata: Metadata = { title: 'Set up your JobPilot — JobPilot' };

/**
 * One onboarding step. Earlier steps can be revisited; later steps redirect back to the current one.
 * Step content is the next M1 items (Upload, Confirm profile, Set targets, Schedule).
 */
export default async function OnboardingStepPage({ params }: { params: Promise<{ step: string }> }) {
  const step = stepFromSlug((await params).step);
  if (!step) notFound();

  const me = await requireUser({ onboarded: false });
  if (stepIndex(step) > stepIndex(me.onboardingStep)) redirect(onboardingPath(me.onboardingStep));

  return (
    <>
      <Stepper steps={onboardingSteps.map((s) => stepLabels[s])} current={stepIndex(step)} />
      {step === 'upload' ? (
        <UploadStep />
      ) : step === 'confirm_profile' ? (
        <ConfirmProfileStep />
      ) : step === 'set_targets' ? (
        <SetTargetsStep />
      ) : (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{stepLabels[step]}</h2>
          <p className={styles.muted}>This step is built next (M1). You are on step {stepIndex(step) + 1} of 4.</p>
        </section>
      )}
    </>
  );
}
