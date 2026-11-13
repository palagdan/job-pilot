'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Select as S } from 'radix-ui';
import type { ReactNode } from 'react';
import { Field } from './field.tsx';
import fieldStyles from './field.module.css';
import styles from './select.module.css';

export type SelectOption = { value: string; label: ReactNode; description?: ReactNode; disabled?: boolean };

/** Single select (Experience, Run time, Day of week, Theme, Pipeline filters/sort). */
export function Select({
  label,
  hint,
  error,
  options,
  value,
  onValueChange,
  placeholder = 'Select…',
  disabled,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  options: readonly SelectOption[];
  value: string | undefined;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(control) => (
        <S.Root value={value} onValueChange={onValueChange} disabled={disabled}>
          <S.Trigger className={`${fieldStyles.control} ${styles.trigger}`} data-invalid={error ? '' : undefined} {...control}>
            <span className={styles.value}>
              <S.Value placeholder={<span className={fieldStyles.placeholder}>{placeholder}</span>} />
            </span>
            <S.Icon className={styles.chevron}>
              <ChevronDown aria-hidden="true" />
            </S.Icon>
          </S.Trigger>
          <S.Portal>
            <S.Content className={styles.content} position="popper" sideOffset={6}>
              <S.Viewport className={styles.viewport}>
                {options.map((o) => (
                  <S.Item key={o.value} value={o.value} disabled={o.disabled} className={styles.item}>
                    <span className={styles.itemText}>
                      <S.ItemText>{o.label}</S.ItemText>
                      {o.description && <span className={styles.description}>{o.description}</span>}
                    </span>
                    <S.ItemIndicator className={styles.check}>
                      <Check aria-hidden="true" />
                    </S.ItemIndicator>
                  </S.Item>
                ))}
              </S.Viewport>
            </S.Content>
          </S.Portal>
        </S.Root>
      )}
    </Field>
  );
}
