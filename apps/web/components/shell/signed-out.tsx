'use client';

import { useQueryClient } from '@tanstack/react-query';
import { LogIn } from 'lucide-react';
import { useState } from 'react';
import { queryKeys } from '../../lib/api/query-client.ts';
import { Logo } from '../brand/logo.tsx';
import { Button } from '../ui/button.tsx';
import { toast } from '../ui/toast.tsx';
import styles from './app-shell.module.css';

/**
 * Spec §11 "No access" full-page state. The real Login page (01) and route guards are M1;
 * this keeps the shell usable meanwhile. In development it offers the seeded demo user.
 */
export function SignedOut() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<'google' | 'demo' | null>(null);

  const google = async () => {
    setBusy('google');
    const res = await fetch('/api/auth/sign-in/social', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'google', callbackURL: window.location.pathname }),
    });
    const body = (await res.json().catch(() => null)) as { url?: string } | null;
    if (res.ok && body?.url) {
      window.location.assign(body.url);
      return;
    }
    setBusy(null);
    toast.error('Google sign-in is not configured on this server.');
  };

  const demo = async () => {
    setBusy('demo');
    const res = await fetch('/api/dev/sign-in', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    setBusy(null);
    if (!res.ok) {
      toast.error('Demo sign-in failed. Is the api running in development with a seeded database?');
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.me });
  };

  return (
    <main className={styles.fullPage}>
      <div className={styles.fullPageCard}>
        <Logo size="md" />
        <p className={styles.fullPageEyebrow}>No access</p>
        <h1>Sign in to see this page</h1>
        <p className={styles.fullPageText}>This page is part of your JobPilot account.</p>
        <Button variant="primary" onClick={google} loading={busy === 'google'} loadingLabel="Opening Google...">
          Continue with Google
        </Button>
        {process.env.NODE_ENV === 'development' && (
          <Button variant="ghost" icon={<LogIn />} onClick={demo} loading={busy === 'demo'}>
            Dev: sign in as demo user
          </Button>
        )}
      </div>
    </main>
  );
}
