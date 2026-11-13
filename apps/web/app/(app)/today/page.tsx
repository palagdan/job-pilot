import type { Metadata } from 'next';
import { TodayScreen } from './today-screen.tsx';

export const metadata: Metadata = { title: 'Today — JobPilot' };

export default function Page() {
  return <TodayScreen />;
}
