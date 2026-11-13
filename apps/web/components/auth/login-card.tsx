'use client';

import { LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Logo } from '../brand/logo.tsx';
import { Button } from '../ui/button.tsx';
import { Modal } from '../ui/dialog.tsx';
import { toast } from '../ui/toast.tsx';
import { GoogleMark } from './google-mark.tsx';
import styles from './login.module.css';

/**
 * 01 Login card. Google sign-in uses Better Auth's redirect flow (no pop-up, so E02 does not apply):
 * POST /api/auth/sign-in/social → { url } → browser goes to Google → back to `next` (or /onboarding for new users).
 * If Google returns an error, Better Auth sends the user to /login?error=… and E01 opens.
 */
export function LoginCard({ next, googleFailed, devSignIn }: { next: string; googleFailed: boolean; devSignIn: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'google' | 'demo' | null>(null);
  const [errorOpen, setErrorOpen] = useState(googleFailed);

  const continueWithGoogle = async () => {
    setBusy('google');
    setErrorOpen(false);
    try {
      const res = await fetch('/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          callbackURL: next,
          // First sign-in: the server page sends the user on to their current onboarding step.
          newUserCallbackURL: '/onboarding',
          errorCallbackURL: `/login?error=google&next=${encodeURIComponent(next)}`,
        }),
      });
      const body = (await res.json().catch(() => null)) as { url?: string } | null;
      if (res.ok && body?.url) {
        window.location.assign(body.url);
        return; // keep the loading state while the browser leaves
      }
    } catch {
      // network error → same window as a Google failure
    }
    setBusy(null);
    setErrorOpen(true);
  };

  const signInAsDemo = async () => {
    setBusy('demo');
    const res = await fetch('/api/dev/sign-in', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (!res.ok) {
      setBusy(null);
      toast.error('Demo sign-in failed. Run `pnpm db:seed` and start the api in development.');
      return;
    }
    // The server login page redirects to the right place (onboarding step or `next`).
    router.refresh();
  };

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="login-title">
        <Logo size="md" />
        <h1 id="login-title" className={styles.tagline}>
          Your AI co-pilot for the whole job search
        </h1>
        <Button
          className={styles.google}
          onClick={continueWithGoogle}
          loading={busy === 'google'}
          loadingLabel="Opening Google..."
          disabled={busy === 'demo'}
          icon={<GoogleMark />}
        >
          Continue with Google
        </Button>
        <p className={styles.legal}>By continuing you agree to the Terms and Privacy Policy</p>
        {devSignIn && (
          <Button variant="ghost" size="sm" icon={<LogIn />} onClick={signInAsDemo} loading={busy === 'demo'} disabled={busy === 'google'}>
            Dev: sign in as demo user
          </Button>
        )}
      </section>

      {/* E01 Google sign-in failed */}
      <Modal
        open={errorOpen}
        onOpenChange={setErrorOpen}
        title="Could not sign you in"
        description="Google did not complete the sign-in. Try again or use another Google account."
        actions={
          <>
            <Button onClick={() => setErrorOpen(false)}>Close</Button>
            <Button variant="primary" onClick={continueWithGoogle}>
              Try again
            </Button>
          </>
        }
      />
    </main>
  );
}
