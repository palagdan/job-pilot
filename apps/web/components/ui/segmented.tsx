'use client';

import { ToggleGroup } from 'radix-ui';
import type { ReactNode } from 'react';
import styles from './segmented.module.css';

/** Segmented control, single choice, never empty (Run frequency: Daily / Every 3 days / Weekly). */
export function Segmented<V extends string>({
  label,
  options,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  options: readonly { value: V; label: ReactNode }[];
  value: V;
  onValueChange: (value: V) => void;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      className={styles.root}
      value={value}
      aria-label={label}
      disabled={disabled}
      // Radix allows deselecting the active item; a segmented control always has one value.
      onValueChange={(v) => v && onValueChange(v as V)}
    >
      {options.map((o) => (
        <ToggleGroup.Item key={o.value} value={o.value} className={styles.item}>
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
