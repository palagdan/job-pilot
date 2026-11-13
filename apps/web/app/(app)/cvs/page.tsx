import type { Metadata } from 'next';
import { CvsPage } from '../../../components/cv/cvs-page.tsx';

export const metadata: Metadata = { title: 'CVs — JobPilot' };

export default function Page() {
  return <CvsPage />;
}
