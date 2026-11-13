'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '../brand/logo.tsx';
import styles from './app-shell.module.css';
import { navItems } from './nav-items.ts';
import { UserMenu } from './user-menu.tsx';

/** Figma "Sidebar": 240 px, logo, nav items (active = soft), user at the bottom. */
export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className={styles.sidebar}>
      <Link href="/today" className={styles.logo} aria-label="JobPilot — Today">
        <Logo size="sm" />
      </Link>
      <nav aria-label="Main" className={styles.nav}>
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} className={styles.navItem} aria-current={active ? 'page' : undefined}>
              <Icon aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
      <UserMenu />
    </aside>
  );
}
