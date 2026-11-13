import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '../../components/brand/logo.tsx';
import { requireUser } from '../../lib/session/get-session-user.ts';
import styles from './focus.module.css';

/** Full-width screens without the sidebar and chat (Figma 06 New CV). Signed-in, onboarded users only. */
export default async function FocusLayout({ children }: { children: ReactNode }) {
  await requireUser({ onboarded: true });
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Link href="/today" aria-label="JobPilot — Today">
          <Logo size="sm" />
        </Link>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
