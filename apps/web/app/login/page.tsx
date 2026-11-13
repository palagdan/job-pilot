import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginCard } from '../../components/auth/login-card.tsx';
import { destinationFor } from '../../lib/onboarding/steps.ts';
import { getSessionUser } from '../../lib/session/get-session-user.ts';
import { safeNext } from '../../lib/session/safe-next.ts';

export const metadata: Metadata = { title: 'Sign in — JobPilot' };

/** 01 Login. Signed-in users go straight to where they belong (onboarding step or `next`). */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const target = safeNext(next);
  const me = await getSessionUser();
  if (me) redirect(destinationFor(me, target));

  return <LoginCard next={target} googleFailed={error !== undefined} devSignIn={process.env.NODE_ENV === 'development'} />;
}
