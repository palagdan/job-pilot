'use client';

import { Tooltip as T } from 'radix-ui';
import type { ReactNode } from 'react';
import styles from './tooltip.module.css';

/** Wrap the app once (in providers). */
export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <T.Provider delayDuration={300}>{children}</T.Provider>
);

/** Hover/focus tooltip. `children` must be a focusable element that accepts a ref. */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  if (!content) return children;
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content className={styles.content} sideOffset={6}>
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
