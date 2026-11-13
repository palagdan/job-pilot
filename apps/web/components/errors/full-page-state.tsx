import type { ReactNode } from 'react';
import { Logo } from '../brand/logo.tsx';
import styles from './full-page-state.module.css';

/** Spec §11 full-page states (404, 500, Maintenance, No access): no sidebar, centered card. */
export function FullPageState({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="state-title">
        <Logo size="md" />
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 id="state-title">{title}</h1>
        <p className={styles.text}>{children}</p>
        {action && <div className={styles.action}>{action}</div>}
      </section>
    </main>
  );
}
