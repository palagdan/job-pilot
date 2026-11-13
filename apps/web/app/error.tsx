'use client';

import { useEffect } from 'react';
import { FullPageState } from '../components/errors/full-page-state.tsx';
import { Button } from '../components/ui/button.tsx';

/** Spec §11: 500 — any uncaught render error under the root layout. "Try again" re-renders the segment. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <FullPageState
      eyebrow="500"
      title="Something went wrong on our side"
      action={
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
      }
    >
      We are already looking into it. Try again in a few minutes.
      {error.digest ? ` (Error code: ${error.digest})` : ''}
    </FullPageState>
  );
}
