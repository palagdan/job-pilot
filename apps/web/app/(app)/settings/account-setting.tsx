'use client';

import { LogOut } from 'lucide-react';
import { Button } from '../../../components/ui/button.tsx';
import { ConfirmDialog } from '../../../components/ui/dialog.tsx';
import { useSignOut } from '../../../lib/session/use-sign-out.ts';
import styles from './settings.module.css';

/** Settings > Account. (Export my data / Delete account are out of v1 scope.) */
export function AccountSetting() {
  const signOut = useSignOut();
  return (
    <div className={styles.row}>
      <div>
        <p className={styles.label}>Sign out</p>
        <p className={styles.muted}>The agent keeps working on its schedule while you are signed out.</p>
      </div>
      <Button icon={<LogOut />} onClick={() => void signOut.request()}>
        Sign out
      </Button>
      <ConfirmDialog {...signOut.confirm} />
    </div>
  );
}
