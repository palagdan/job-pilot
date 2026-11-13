import type { Metadata } from 'next';
import { PageHeader } from '../../../components/shell/page-header.tsx';
import { AccountSetting } from './account-setting.tsx';
import { AgentSetting } from './agent-setting.tsx';
import styles from './settings.module.css';
import { ThemeSetting } from './theme-setting.tsx';

export const metadata: Metadata = { title: 'Settings — JobPilot' };

/** Settings (spec §3): Theme, Pause/Resume agent (C07), Sign out (C10). */
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Appearance, your agent and your account" />
      <section className={styles.card}>
        <h2>Appearance</h2>
        <div className={styles.field}>
          <ThemeSetting />
        </div>
      </section>
      <section className={styles.card}>
        <h2>Agent</h2>
        <AgentSetting />
      </section>
      <section className={styles.card}>
        <h2>Account</h2>
        <AccountSetting />
      </section>
    </>
  );
}
