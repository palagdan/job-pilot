'use client';

import { Command } from 'cmdk';
import { Check, ChevronDown } from 'lucide-react';
import { Popover } from 'radix-ui';
import { type ReactNode, useState } from 'react';
import { Field } from './field.tsx';
import fieldStyles from './field.module.css';
import selectStyles from './select.module.css';
import styles from './searchable-select.module.css';

export type SearchableOption = { value: string; label: string; description?: string; keywords?: string[] };

/** Single select with search (Time zone). Search matches label, value and keywords. */
export function SearchableSelect({
  label,
  hint,
  error,
  options,
  value,
  onValueChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'Nothing found',
  disabled,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  options: readonly SearchableOption[];
  value: string | undefined;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Field label={label} hint={hint} error={error}>
      {(control) => (
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger
            className={`${fieldStyles.control} ${selectStyles.trigger}`}
            disabled={disabled}
            data-disabled={disabled ? '' : undefined}
            data-invalid={error ? '' : undefined}
            {...control}
          >
            <span className={selectStyles.value}>
              {selected ? selected.label : <span className={fieldStyles.placeholder}>{placeholder}</span>}
            </span>
            <ChevronDown className={selectStyles.chevron} aria-hidden="true" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content className={styles.content} sideOffset={6} align="start">
              <Command className={styles.command} label={typeof label === 'string' ? label : 'Options'}>
                <Command.Input className={styles.search} placeholder={searchPlaceholder} />
                <Command.List className={styles.list}>
                  <Command.Empty className={styles.empty}>{emptyText}</Command.Empty>
                  {options.map((o) => (
                    <Command.Item
                      key={o.value}
                      value={o.value}
                      keywords={[o.label, ...(o.keywords ?? [])]}
                      className={selectStyles.item}
                      onSelect={() => {
                        onValueChange(o.value);
                        setOpen(false);
                      }}
                    >
                      <span className={selectStyles.itemText}>
                        <span>{o.label}</span>
                        {o.description && <span className={selectStyles.description}>{o.description}</span>}
                      </span>
                      {o.value === value && <Check className={selectStyles.check} aria-label="Selected" />}
                    </Command.Item>
                  ))}
                </Command.List>
              </Command>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </Field>
  );
}
