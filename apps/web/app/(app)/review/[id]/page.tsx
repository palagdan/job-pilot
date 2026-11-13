import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReviewItem } from '../review-item.tsx';

export const metadata: Metadata = { title: 'Review — JobPilot' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <ReviewItem id={id} />
    </Suspense>
  );
}
