'use client';

import { type CSSProperties, useEffect, useState } from 'react';
import styles from './skeleton.module.css';

/** Placeholder block. Shape it like the real content (spec §10: "skeleton shape matches the real card"). */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 'var(--radius-xs)',
  style,
}: {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  radius?: CSSProperties['borderRadius'];
  style?: CSSProperties;
}) {
  return <span className={styles.skeleton} style={{ width, height, borderRadius: radius, ...style }} aria-hidden="true" />;
}

/** Spec §10: show skeletons only if loading takes more than 300 ms. */
export function useDelayedFlag(active: boolean, delayMs = 300): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setElapsed(true), delayMs);
    return () => {
      clearTimeout(timer);
      setElapsed(false);
    };
  }, [active, delayMs]);
  return active && elapsed;
}
