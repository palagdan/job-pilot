import Link from 'next/link';
import type { ReactNode } from 'react';
import buttonStyles from '../ui/button.module.css';

/** A link that looks like the primary pill button (navigation, not an action). */
export function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`}>
      {children}
    </Link>
  );
}
