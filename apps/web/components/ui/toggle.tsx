'use client';

import { Switch } from 'radix-ui';
import { type ReactNode, useId } from 'react';
import styles from './toggle.module.css';

/**
 * Toggle with label + description (Figma "What to look for", "Notify me by").
 * Spec: switches at once and saves; on failure the caller reverts `checked` and shows a toast.
 */
export function Toggle({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={styles.row}>
      <span className={styles.text}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        {description && <span className={styles.description}>{description}</span>}
      </span>
      <Switch.Root id={id} className={styles.track} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled}>
        <Switch.Thumb className={styles.thumb} />
      </Switch.Root>
    </div>
  );
}
