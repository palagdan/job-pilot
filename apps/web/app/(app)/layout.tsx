import type { ReactNode } from 'react';
import { AppShell } from '../../components/shell/app-shell.tsx';
import { requireUser } from '../../lib/session/get-session-user.ts';

/** Every signed-in screen: Sidebar · Content. Signed out → login; onboarding unfinished → its step. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await requireUser({ onboarded: true });
  return <AppShell initialMe={me}>{children}</AppShell>;
}
