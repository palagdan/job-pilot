import type { Metadata } from 'next';
import { FullPageState } from '../../components/errors/full-page-state.tsx';

export const metadata: Metadata = { title: 'Maintenance — JobPilot' };

/** Spec §11: Maintenance. Every page is rewritten here while `MAINTENANCE_MODE=true` (proxy.ts). */
export default function MaintenancePage() {
  return (
    <FullPageState eyebrow="Maintenance" title="JobPilot is being updated">
      We will be back within the hour. Your agent keeps its schedule.
    </FullPageState>
  );
}
