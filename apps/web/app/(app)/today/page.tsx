import type { Metadata } from 'next';
import { PageHeader } from '../../../components/shell/page-header.tsx';
import { EmptyState } from '../../../components/ui/empty-state.tsx';

export const metadata: Metadata = { title: 'Today — JobPilot' };

/** Placeholder until the screen is built (see docs/todo.md). */
export default function Page() {
  return (
    <>
      <PageHeader title="Today" subtitle="Jobs and events your agent found" />
      <EmptyState title="Today arrives in M3" description="Opportunity cards, filters and the run panel are Daniil's M3 item." />
    </>
  );
}
