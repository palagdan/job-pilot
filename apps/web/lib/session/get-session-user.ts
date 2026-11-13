import 'server-only';

import { type Me, meSchema } from '@job-pilot/shared/user';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { onboardingPath } from '../onboarding/steps.ts';
import { loginUrl, pathnameHeader } from './safe-next.ts';

const apiUrl = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Server-side session check (the authoritative one; proxy.ts only looks at the cookie).
 * Calls the api's GET /v1/me with the browser's cookies. Cached per request.
 * Returns null when signed out; throws on api failures so error.tsx shows the 500 state.
 */
export const getSessionUser = cache(async (): Promise<Me | null> => {
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join('; ');
  if (!cookieHeader) return null;

  const res = await fetch(`${apiUrl}/v1/me`, { headers: { cookie: cookieHeader }, cache: 'no-store' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /v1/me failed with ${res.status}`);
  return meSchema.parse(await res.json());
});

/**
 * For signed-in screens. Signed out → /login?next=…; onboarding unfinished → current step.
 * `onboarded: false` is for the onboarding pages themselves.
 */
export async function requireUser(options: { onboarded: boolean }): Promise<Me> {
  const me = await getSessionUser();
  if (!me) redirect(loginUrl((await headers()).get(pathnameHeader) ?? undefined));
  if (options.onboarded && !me.onboardingCompletedAt) redirect(onboardingPath(me.onboardingStep));
  if (!options.onboarded && me.onboardingCompletedAt) redirect('/today');
  return me;
}
