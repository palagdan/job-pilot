import type { Metadata } from 'next';
import { PageHeader } from '../../../components/shell/page-header.tsx';
import { ThemeSetting } from './theme-setting.tsx';

export const metadata: Metadata = { title: 'Settings — JobPilot' };

/** Settings (spec §3). Theme works now; pause agent, sign out and account actions land in M3. */
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Appearance and account" />
      <ThemeSetting />
    </>
  );
}
