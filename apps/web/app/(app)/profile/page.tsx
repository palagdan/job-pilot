import type { Metadata } from 'next';
import { ProfileAndTargets } from '../../../components/profile/profile-and-targets.tsx';

export const metadata: Metadata = { title: 'Profile and targets — JobPilot' };

export default function Page() {
  return <ProfileAndTargets />;
}
