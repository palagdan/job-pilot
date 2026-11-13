'use client';

import type { ReactNode } from 'react';
import styles from './chip.module.css';

/** Static chip (type labels like "Job", route "Direct"). `selected` = soft blue. */
export function Chip({ children, selected = false }: { children: ReactNode; selected?: boolean }) {
  return (
    <span className={styles.chip} data-selected={selected || undefined}>
      {children}
    </span>
  );
}

export type ChipOption<V extends string> = { value: V; label: ReactNode; count?: number; disabled?: boolean };

type SingleProps<V extends string> = {
  type: 'single';
  value: V;
  onChange: (value: V) => void;
};
type MultipleProps<V extends string> = {
  type: 'multiple';
  value: V[];
  onChange: (value: V[]) => void;
  /** Spec: "at least one must be selected" — the last selected chip cannot be turned off. */
  minSelected?: number;
};

/**
 * Chip group. Single (Today filter "All 6 / Jobs 3 / Events 2") or multiple (Work format).
 * Count is shown after the label; a chip with `disabled` stays visible but cannot be picked.
 */
export function ChipGroup<V extends string>({
  options,
  label,
  ...props
}: { options: readonly ChipOption<V>[]; label: string } & (SingleProps<V> | MultipleProps<V>)) {
  const isSelected = (v: V) => (props.type === 'single' ? props.value === v : props.value.includes(v));

  const toggle = (v: V) => {
    if (props.type === 'single') return props.onChange(v);
    const has = props.value.includes(v);
    if (has && props.value.length <= (props.minSelected ?? 0)) return;
    props.onChange(has ? props.value.filter((x) => x !== v) : [...props.value, v]);
  };

  return (
    <div className={styles.group} role={props.type === 'single' ? 'radiogroup' : 'group'} aria-label={label}>
      {options.map((o) => {
        const selected = isSelected(o.value);
        return (
          <button
            key={o.value}
            type="button"
            className={styles.chip}
            data-selected={selected || undefined}
            disabled={o.disabled}
            role={props.type === 'single' ? 'radio' : undefined}
            aria-checked={props.type === 'single' ? selected : undefined}
            aria-pressed={props.type === 'multiple' ? selected : undefined}
            onClick={() => toggle(o.value)}
          >
            {o.label}
            {o.count !== undefined && <span className={styles.count}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
