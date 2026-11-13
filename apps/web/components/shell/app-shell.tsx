'use client';

import type { ReactNode } from 'react';
import { ApiError } from '../../lib/api/api-client.ts';
import { useMe } from '../../lib/api/use-me.ts';
import { Banner } from '../ui/banner.tsx';
import styles from './app-shell.module.css';
import { ChatPanelSlot } from './chat-panel-slot.tsx';
import { Sidebar } from './sidebar.tsx';
import { SignedOut } from './signed-out.tsx';

/**
 * Signed-in layout (Figma 07–11): Sidebar 240 · Content (padding 32, gap 20) · Chat panel 320.
 * Pages render their own <PageHeader/> and content; `chat` replaces the chat placeholder (M5).
 */
export function AppShell({ children, chat }: { children: ReactNode; chat?: ReactNode }) {
  const me = useMe();

  if (me.error instanceof ApiError && me.error.code === 'unauthorized') return <SignedOut />;

  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.content} id="content">
        {me.error && (
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
