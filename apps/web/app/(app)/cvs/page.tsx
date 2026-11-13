import type { Metadata } from 'next';
import { PageHeader } from '../../../components/shell/page-header.tsx';
import { EmptyState } from '../../../components/ui/empty-state.tsx';

export const metadata: Metadata = { title: 'CVs — JobPilot' };

/** Placeholder until the screen is built (see docs/todo.md). */
export default function Page() {
  return (
    <>
      <PageHeader title="CVs" subtitle="Your master CV and the special versions made for each application" />
      <EmptyState title="CVs arrive in M2" description="The master CV and special CVs list are Artem's M2 item." />
    </>
  );
}
