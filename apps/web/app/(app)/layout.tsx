import type { ReactNode } from 'react';
import { AppShell } from '../../components/shell/app-shell.tsx';

/** Every signed-in screen: Sidebar · Content · Chat panel. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
