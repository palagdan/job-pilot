'use client';

import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { Field } from './field.tsx';
import fieldStyles from './field.module.css';

type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  ref?: Ref<HTMLInputElement>;
};

export function TextInput({ label, hint, error, className, ref, ...rest }: TextInputProps) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(control) => (
        <input ref={ref} className={[fieldStyles.control, className].filter(Boolean).join(' ')} {...control} {...rest} />
      )}
    </Field>
  );
}
