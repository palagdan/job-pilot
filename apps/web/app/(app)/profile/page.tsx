import type { Metadata } from 'next';
import { PageHeader } from '../../../components/shell/page-header.tsx';
import { EmptyState } from '../../../components/ui/empty-state.tsx';

export const metadata: Metadata = { title: 'Profile and targets — JobPilot' };

/** Placeholder until the screen is built (see docs/todo.md). */
export default function Page() {
  return (
    <>
      <PageHeader title="Profile and targets" subtitle="Everything JobPilot believes about you. Always visible, always editable." />
      <EmptyState title="Profile and targets arrive in M2" description="Same controls as onboarding steps 2–4." />
    </>
  );
}
