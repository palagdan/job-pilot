import type { Metadata } from 'next';
import { FullPageState } from '../../components/errors/full-page-state.tsx';
import { LinkButton } from '../../components/errors/link-button.tsx';
import { loginUrl } from '../../lib/session/safe-next.ts';

export const metadata: Metadata = { title: 'Sign in — JobPilot' };

/** Spec §11: No access — a JobPilot page for someone without access to it (e.g. a shared link). */
export default async function NoAccessPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <FullPageState
      eyebrow="No access"
      title="Sign in to see this page"
      action={<LinkButton href={loginUrl(next)}>Continue with Google</LinkButton>}
    >
      This page is part of your JobPilot account.
    </FullPageState>
  );
}
