import type { ReactNode } from 'react';
import { requireUser } from '../../lib/session/get-session-user.ts';
import styles from './onboarding.module.css';

/** Figma 02–05 "Set up your JobPilot": title, stepper (in the step page), step card. Finished users → /today. */
export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  await requireUser({ onboarded: false });
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Set up your JobPilot</h1>
      {children}
    </main>
  );
}
