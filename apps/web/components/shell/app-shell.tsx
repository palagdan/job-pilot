'use client';

import type { Me } from '@job-pilot/shared/user';
import { type ReactNode, useEffect } from 'react';
import { ApiError } from '../../lib/api/api-client.ts';
import { useMe } from '../../lib/api/use-me.ts';
import { loginUrl } from '../../lib/session/safe-next.ts';
import { Banner } from '../ui/banner.tsx';
import styles from './app-shell.module.css';
import { ChatPanelSlot } from './chat-panel-slot.tsx';
import { Sidebar } from './sidebar.tsx';

/**
 * Signed-in layout (Figma 07–11): Sidebar 240 · Content (padding 32, gap 20) · Chat panel 320.
 * The server layout already checked the session; if it expires later, the user goes back to login
 * (the E03 "You were signed out" window is the M3 global error handling item).
 */
export function AppShell({ children, chat, initialMe }: { children: ReactNode; chat?: ReactNode; initialMe: Me }) {
  const me = useMe(initialMe);
  const signedOut = me.error instanceof ApiError && me.error.code === 'unauthorized';

  useEffect(() => {
    if (signedOut) window.location.assign(loginUrl(`${window.location.pathname}${window.location.search}`));
  }, [signedOut]);

  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.content} id="content">
        {me.error && !signedOut && (
          <Banner tone="danger" title="Could not load your account" action={{ label: 'Retry', onClick: () => me.refetch() }}>
            {me.error instanceof ApiError && me.error.code === 'network'
              ? 'Check your connection.'
              : 'Something went wrong on our side. Try again in a moment.'}
          </Banner>
        )}
        {children}
      </main>
      <ChatPanelSlot>{chat}</ChatPanelSlot>
    </div>
  );
}
