import type { Metadata } from 'next';
import { ReviewIndex } from './review-index.tsx';

export const metadata: Metadata = { title: 'Review — JobPilot' };

export default function Page() {
  return <ReviewIndex />;
}
