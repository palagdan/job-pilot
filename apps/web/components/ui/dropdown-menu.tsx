'use client';

import { Check } from 'lucide-react';
import { DropdownMenu as M } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import styles from './dropdown-menu.module.css';

/** Radix dropdown menu with JobPilot styling. Compose: <DropdownMenu trigger={...}><MenuItem/>...</DropdownMenu>. */
export function DropdownMenu({
  trigger,
  children,
  align = 'start',
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
}) {
  return (
    <M.Root>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <MenuContent align={align}>{children}</MenuContent>
    </M.Root>
  );
}

export function MenuContent({ children, align = 'start' }: { children: ReactNode; align?: 'start' | 'end' }) {
  return (
    <M.Portal>
      <M.Content className={styles.content} align={align} sideOffset={6} collisionPadding={8}>
        {children}
      </M.Content>
    </M.Portal>
  );
}

type MenuItemProps = Omit<ComponentProps<typeof M.Item>, 'children'> & {
  children: ReactNode;
  /** Second line in muted text ("Agent picks the best way in"). */
  description?: ReactNode;
  icon?: ReactNode;
  /** Marks the current choice (e.g. current route). */
  selected?: boolean;
  tone?: 'default' | 'danger';
  /** Shown on hover when disabled ("No upcoming events"). */
  disabledReason?: string;
};

export function MenuItem({ children, description, icon, selected, tone = 'default', disabledReason, ...rest }: MenuItemProps) {
  return (
    <M.Item className={styles.item} data-tone={tone} title={rest.disabled ? disabledReason : undefined} {...rest}>
      {icon && <span className={styles.icon}>{icon}</span>}
      <span className={styles.text}>
        <span>{children}</span>
        {description && <span className={styles.description}>{description}</span>}
        {rest.disabled && disabledReason && <span className={styles.description}>{disabledReason}</span>}
      </span>
      {selected && <Check className={styles.check} aria-label="Selected" />}
    </M.Item>
  );
}

export const MenuSeparator = () => <M.Separator className={styles.separator} />;
export const MenuLabel = ({ children }: { children: ReactNode }) => <M.Label className={styles.label}>{children}</M.Label>;
