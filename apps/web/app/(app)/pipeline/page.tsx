import type { Metadata } from 'next';
import { PipelinePage } from '../../../components/pipeline/pipeline-page.tsx';

export const metadata: Metadata = { title: 'Pipeline — JobPilot' };

export default function Page() {
  return <PipelinePage />;
}
