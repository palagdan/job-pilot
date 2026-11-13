'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ChevronsUpDown, LogOut, Pause, Settings, Target } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMe } from '../../lib/api/use-me.ts';
import { ConfirmDialog } from '../ui/dialog.tsx';
import { DropdownMenu, MenuItem, MenuSeparator } from '../ui/dropdown-menu.tsx';
import { Skeleton } from '../ui/skeleton.tsx';
import { toast } from '../ui/toast.tsx';
import styles from './app-shell.module.css';

/** Sidebar bottom: user + menu (spec "User menu": Profile and targets, Settings, Pause agent, Sign out). */
export function UserMenu() {
  const { data: me } = useMe();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const signOut = async () => {
    const res = await fetch('/api/auth/sign-out', { method: 'POST' });
    if (!res.ok) {
      toast.error('Could not sign out. Try again.');
      return;
    }
    queryClient.clear();
    router.refresh();
  };

  if (!me) {
    return (
      <div className={styles.user}>
        <Skeleton width={32} height={32} radius="50%" />
        <span className={styles.userText}>
          <Skeleton width={96} height={12} />
          <Skeleton width={72} height={10} />
        </span>
      </div>
    );
  }

  return (
    <>
      <DropdownMenu
        align="start"
        trigger={
          <button type="button" className={styles.user} aria-label={`Account menu for ${me.name}`}>
            {me.image ? (
              <Image className={styles.avatar} src={me.image} alt="" width={32} height={32} />
            ) : (
              <span className={styles.avatar} aria-hidden="true">
                {me.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className={styles.userText}>
              <span className={styles.userName}>{me.name}</span>
              <span className={styles.userSub}>Google account</span>
            </span>
            <ChevronsUpDown className={styles.userChevron} aria-hidden="true" />
          </button>
        }
      >
        <MenuItem icon={<Target />} onSelect={() => router.push('/profile')}>
          Profile and targets
        </MenuItem>
        <MenuItem icon={<Settings />} onSelect={() => router.push('/settings')}>
          Settings
        </MenuItem>
        {/* Pause/resume (C07) lands with Settings in M3. */}
        <MenuItem icon={<Pause />} disabled disabledReason="Available soon">
          Pause agent
        </MenuItem>
        <MenuSeparator />
        {/* C10 asks for confirmation only when packs are ready to send; the count comes with Pipeline (M4). */}
        <MenuItem icon={<LogOut />} onSelect={() => setConfirmSignOut(true)}>
          Sign out
        </MenuItem>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title="Sign out?"
        description="The agent keeps working on its schedule while you are signed out."
        confirmLabel="Sign out"
        onConfirm={signOut}
      />
    </>
  );
}
