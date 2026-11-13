'use client';

import { ChevronDown } from 'lucide-react';
import { DropdownMenu as M } from 'radix-ui';
import type { ReactNode } from 'react';
import { Button, type ButtonVariant } from './button.tsx';
import { MenuContent } from './dropdown-menu.tsx';
import styles from './split-button.module.css';

/**
 * Main action + arrow that opens more options (spec: Skip with reasons, Pipeline "Open ▾").
 * "One click on Skip skips at once; the arrow opens reasons."
 */
export function SplitButton({
  children,
  onClick,
  menu,
  menuLabel,
  variant = 'secondary',
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  /** `<MenuItem>`s */
  menu: ReactNode;
  /** Accessible name for the arrow, e.g. "Skip reasons". */
  menuLabel: string;
  variant?: ButtonVariant;
  disabled?: boolean;
}) {
  return (
    <span className={styles.group}>
      <Button variant={variant} className={styles.main} onClick={onClick} disabled={disabled}>
        {children}
      </Button>
      <M.Root>
        <M.Trigger asChild disabled={disabled}>
          <Button variant={variant} className={styles.arrow} aria-label={menuLabel} disabled={disabled}>
            <ChevronDown aria-hidden="true" />
          </Button>
        </M.Trigger>
        <MenuContent align="end">{menu}</MenuContent>
      </M.Root>
    </span>
  );
}
