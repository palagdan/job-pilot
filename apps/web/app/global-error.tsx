'use client';

import './styles/globals.css';

/** Last resort when the root layout itself fails: no providers or fonts, plain 500 copy. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ display: 'grid', minHeight: '100dvh', placeItems: 'center', textAlign: 'center', padding: 24 }}>
        <main>
          <h1>Something went wrong on our side</h1>
          <p>We are already looking into it. Try again in a few minutes.</p>
          <button type="button" onClick={reset} style={{ marginTop: 16, padding: '10px 16px', borderRadius: 999 }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
