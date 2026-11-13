import { Check } from 'lucide-react';
import { Fragment } from 'react';
import styles from './stepper.module.css';

/** Onboarding stepper (Figma "Stepper"): current = primary pill, upcoming = outlined, done = soft with check. */
export function Stepper({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className={styles.stepper}>
      {steps.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'upcoming';
        return (
          <Fragment key={label}>
            {index > 0 && <li className={styles.connector} aria-hidden="true" data-done={index <= current || undefined} />}
            <li className={styles.step} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
              {state === 'done' ? <Check aria-hidden="true" /> : <span>{index + 1}</span>}
              <span>{label}</span>
              {state === 'done' && <span className={styles.srOnly}>(done)</span>}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
