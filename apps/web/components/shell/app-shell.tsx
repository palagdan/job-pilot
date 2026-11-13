'use client';

import type { Me } from '@job-pilot/shared/user';
import { type ReactNode, useEffect } from 'react';
import { ApiError } from '../../lib/api/api-client.ts';
import { useAgentControls } from '../../lib/api/use-agent.ts';
import { useMe } from '../../lib/api/use-me.ts';
import { useTheme } from '../../lib/theme/theme-provider.tsx';
import { OfflineBanner } from '../errors/offline-banner.tsx';
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
  // A 401 opens E03 "You were signed out" (global error windows); the banner below is for other failures.
  const signedOut = me.error instanceof ApiError && me.error.code === 'unauthorized';
  const agent = useAgentControls();
  const { theme, setTheme } = useTheme();
  const savedTheme = me.data?.theme;

  // The theme is stored per user: on a new device (no cookie yet) apply the saved one.
  useEffect(() => {
    if (savedTheme && savedTheme !== theme) setTheme(savedTheme);
  }, [savedTheme, theme, setTheme]);


  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.content} id="content">
        <OfflineBanner />
        {me.error && !signedOut && !(me.error instanceof ApiError && me.error.status >= 500) && (
          <Banner tone="danger" title="Could not load your account" action={{ label: 'Retry', onClick: () => me.refetch() }}>
            {me.error instanceof ApiError && me.error.code === 'network'
              ? 'Check your connection.'
              : 'Something went wrong on our side. Try again in a moment.'}
          </Banner>
        )}
        {me.data?.pausedAt && (
          <Banner tone="neutral" title="Your agent is paused" action={{ label: 'Resume', onClick: agent.resume }}>
            No runs and no emails until you resume.
          </Banner>
        )}
        {children}
      </main>
      <ChatPanelSlot>{chat}</ChatPanelSlot>
    </div>
  );
}
