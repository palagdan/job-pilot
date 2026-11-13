'use client';

import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { globalErrors } from '../../lib/errors/global-errors.ts';
import { loginUrl } from '../../lib/session/safe-next.ts';
import { Button } from '../ui/button.tsx';
import { Modal } from '../ui/dialog.tsx';
import { toast } from '../ui/toast.tsx';
import styles from './global-error-dialogs.module.css';

/** Pages where a 401 is expected (signed-out screens), so E03 is not shown there. */
const publicPaths = ['/login', '/no-access', '/maintenance'];

/** E03 / E11 / E12 — mount once (providers). */
export function GlobalErrorDialogs() {
  const error = useSyncExternalStore(globalErrors.subscribe, globalErrors.get, () => null);
  const pathname = usePathname();
  if (!error) return null;

  if (error.kind === 'session') {
    if (publicPaths.some((p) => pathname.startsWith(p))) return null;
    const next = typeof window === 'undefined' ? undefined : `${window.location.pathname}${window.location.search}`;
    return (
      <Modal
        open
        dismissible={false}
        onOpenChange={() => {}}
        title="You were signed out"
        description="For your security the session ended. Sign in again - your work is saved."
        actions={
          <Button variant="primary" onClick={() => window.location.assign(loginUrl(next))}>
            Sign in
          </Button>
        }
      />
    );
  }

  if (error.kind === 'rate-limited') {
    return (
      <Modal
        open
        onOpenChange={globalErrors.clear}
        title="Slow down a little"
        description="Too many requests in a short time. Wait a minute and try again."
        actions={
          <Button variant="primary" onClick={globalErrors.clear}>
            OK
          </Button>
        }
      />
    );
  }

  const copy = async () => {
    if (!error.code) return;
    try {
      await navigator.clipboard.writeText(error.code);
      toast('Copied to clipboard');
    } catch {
      toast.error('Could not copy. Select the text and copy it manually.');
    }
  };
  return (
    <Modal
      open
      onOpenChange={globalErrors.clear}
      title="Something went wrong"
      description="It is on our side. Try again; if it repeats, contact support with the code below."
      actions={
        <>
          {error.code && <Button onClick={() => void copy()}>Copy code</Button>}
          <Button
            variant="primary"
            onClick={() => {
              globalErrors.clear();
              if (error.retry) error.retry();
              else window.location.reload();
            }}
          >
            Try again
          </Button>
        </>
      }
    >
      {error.code && <p className={styles.code}>Error code: {error.code}</p>}
    </Modal>
  );
}
