import type { Metadata } from 'next';
import { PageHeader } from '../../../components/shell/page-header.tsx';
import { EmptyState } from '../../../components/ui/empty-state.tsx';

export const metadata: Metadata = { title: 'Review — JobPilot' };

/** Placeholder until the screen is built (see docs/todo.md). */
export default function Page() {
  return (
    <>
      <PageHeader title="Review" subtitle="Packs waiting for you to send" />
      <EmptyState title="No drafts to review" description="Press Pursue on an opportunity in Today and its drafts appear here." />
    </>
  );
}
