import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CvDetail } from '../../../../components/cv/cv-detail.tsx';

export const metadata: Metadata = { title: 'CV — JobPilot' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <CvDetail id={id} />
    </Suspense>
  );
}
