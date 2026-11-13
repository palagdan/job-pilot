'use client';

import type { ReactNode, Ref, TextareaHTMLAttributes } from 'react';
import { Field } from './field.tsx';
import fieldStyles from './field.module.css';

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  ref?: Ref<HTMLTextAreaElement>;
};

/** Multi-line text input with the same states as TextInput (spec §4). Grows with `rows`. */
export function TextArea({ label, hint, error, className, rows = 4, ref, ...rest }: TextAreaProps) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(control) => (
        <textarea
          ref={ref}
          rows={rows}
          className={[fieldStyles.control, fieldStyles.textarea, className].filter(Boolean).join(' ')}
          {...control}
          {...rest}
        />
      )}
    </Field>
  );
}
