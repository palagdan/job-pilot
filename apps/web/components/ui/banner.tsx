import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './banner.module.css';

export type BannerTone = 'info' | 'warning' | 'danger' | 'neutral';

type BannerAction = { label: string } & ({ href: string } | { onClick: () => void });

/** Banner at the top of the content area; stays until resolved (spec §8). */
export function Banner({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: BannerTone;
  title: ReactNode;
  children?: ReactNode;
  action?: BannerAction;
}) {
  return (
    <section className={styles.banner} data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
      <p className={styles.title}>{title}</p>
      {children && <p className={styles.text}>{children}</p>}
      {action &&
        ('href' in action ? (
          <Link className={styles.action} href={action.href}>
            {action.label}
          </Link>
        ) : (
          <button type="button" className={styles.action} onClick={action.onClick}>
            {action.label}
          </button>
        ))}
    </section>
  );
}
