'use client';

import { ChevronsUpDown, LogOut, Pause, Play, Settings, Target } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAgentControls } from '../../lib/api/use-agent.ts';
import { useMe } from '../../lib/api/use-me.ts';
import { useSignOut } from '../../lib/session/use-sign-out.ts';
import { ConfirmDialog } from '../ui/dialog.tsx';
import { DropdownMenu, MenuItem, MenuSeparator } from '../ui/dropdown-menu.tsx';
import { Skeleton } from '../ui/skeleton.tsx';
import styles from './app-shell.module.css';

/** Sidebar bottom: user + menu (spec "User menu": Profile and targets, Settings, Pause agent, Sign out). */
export function UserMenu() {
  const { data: me } = useMe();
  const router = useRouter();
  const signOut = useSignOut();
  const agent = useAgentControls();

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
        {me.pausedAt ? (
          <MenuItem icon={<Play />} onSelect={agent.resume}>
            Resume agent
          </MenuItem>
        ) : (
          <MenuItem icon={<Pause />} onSelect={agent.requestPause}>
            Pause agent
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuItem icon={<LogOut />} onSelect={() => void signOut.request()}>
          Sign out
        </MenuItem>
      </DropdownMenu>
      <ConfirmDialog {...signOut.confirm} />
      <ConfirmDialog {...agent.confirm} />
    </>
  );
}
