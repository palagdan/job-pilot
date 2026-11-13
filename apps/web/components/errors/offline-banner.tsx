'use client';

import { useSyncExternalStore } from 'react';
import { Banner } from '../ui/banner.tsx';

const subscribe = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

/** E09 / spec §8 banner "You are offline" — shown while the browser has no connection. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <Banner tone="neutral" title="You are offline">
      Changes will be saved when the connection is back.
    </Banner>
  );
}
