import type { Metadata } from 'next';
import { OpsPage } from '../../../components/ops/ops-page.tsx';

export const metadata: Metadata = { title: 'Ops — JobPilot' };

/** Ops view for the team (not in the sidebar): /ops. Access is checked by the api (`ADMIN_EMAILS`). */
export default function Page() {
  return <OpsPage />;
}
