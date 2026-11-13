import type { Metadata } from 'next';
import { FullPageState } from '../components/errors/full-page-state.tsx';
import { LinkButton } from '../components/errors/link-button.tsx';

export const metadata: Metadata = { title: 'Page not found — JobPilot' };

/** Spec §11: 404. */
export default function NotFound() {
  return (
    <FullPageState eyebrow="404" title="This page does not exist" action={<LinkButton href="/today">Open Today</LinkButton>}>
      The link may be old or mistyped.
    </FullPageState>
  );
}
