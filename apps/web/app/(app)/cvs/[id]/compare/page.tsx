import type { Metadata } from 'next';
import { CvCompare } from '../../../../../components/cv/cv-compare.tsx';

export const metadata: Metadata = { title: 'Compare CVs — JobPilot' };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ with?: string }>;
}) {
  const [{ id }, { with: withId }] = await Promise.all([params, searchParams]);
  return <CvCompare id={id} withId={withId} />;
}
