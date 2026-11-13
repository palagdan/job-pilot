import type { Metadata } from 'next';
import { NewCvReview } from '../../../../components/cv/new-cv-review.tsx';

export const metadata: Metadata = { title: 'Your new CV — JobPilot' };

/** 06 New CV — review and confirm. Linked from onboarding and the "Agent is live" email (`/cvs/new`). */
export default function NewCvPage() {
  return <NewCvReview />;
}
