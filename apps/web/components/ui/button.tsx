'use client';

import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from 'react';
import styles from './button.module.css';
import { Spinner } from './spinner.tsx';
import { Tooltip } from './tooltip.tsx';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> & {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  /** Shows a spinner and this label; clicks are ignored; width never shrinks (both labels reserve space). */
  loading?: boolean;
  loadingLabel?: ReactNode;
  disabled?: boolean;
  /** Spec: disabled buttons show the reason in a tooltip. Keeps the button focusable so the tooltip works. */
  disabledReason?: ReactNode;
  icon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
};

/**
 * Pill button (Figma "Button / Primary | Secondary | danger").
 * States per spec §4: hover 85% opacity, keyboard focus ring, loading, disabled 35% + reason tooltip, ≥36px high.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  loadingLabel,
  disabled = false,
  disabledReason,
  icon,
  children,
  className,
  onClick,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  const inactive = disabled || loading;
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (inactive) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  const button = (
    <button
      ref={ref}
      type={type}
      className={[styles.button, styles[variant], styles[size], className].filter(Boolean).join(' ')}
      // aria-disabled (not `disabled`) keeps it focusable for the tooltip and screen readers.
      aria-disabled={inactive || undefined}
      aria-busy={loading || undefined}
      data-disabled={disabled || undefined}
      data-loading={loading || undefined}
      onClick={handleClick}
      {...rest}
    >
      <span className={styles.labels}>
        <span className={styles.label} data-hidden={loading || undefined}>
          {icon}
          {children}
        </span>
        <span className={styles.label} data-hidden={!loading || undefined} aria-hidden={!loading}>
          <Spinner />
          {loadingLabel ?? children}
        </span>
      </span>
    </button>
  );

  return disabled && disabledReason ? <Tooltip content={disabledReason}>{button}</Tooltip> : button;
}
