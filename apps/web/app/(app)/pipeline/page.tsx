import type { Metadata } from 'next';
import { PageHeader } from '../../../components/shell/page-header.tsx';
import { EmptyState } from '../../../components/ui/empty-state.tsx';

export const metadata: Metadata = { title: 'Pipeline — JobPilot' };

/** Placeholder until the screen is built (see docs/todo.md). */
export default function Page() {
  return (
    <>
      <PageHeader title="Pipeline" subtitle="Everything in motion" />
      <EmptyState title="Nothing in motion yet" description="Everything you pursue is tracked here with its status and next step." />
    </>
  );
}
