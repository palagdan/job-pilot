'use client';

import { messages } from '@job-pilot/shared/limits';
import { X } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useId, useState } from 'react';
import fieldStyles from './field.module.css';
import styles from './tag-input.module.css';

export type TagInputProps = {
  label?: ReactNode;
  hint?: ReactNode;
  /** Error from the form (e.g. "Add at least one target role."). Local errors (length/limit/duplicate) are shown too. */
  error?: ReactNode;
  value: string[];
  onChange: (tags: string[]) => void;
  /** Suggestions for the typed text. Filtered client-side if `filter` is true (default). */
  suggestions?: readonly string[];
  /** Called on every keystroke, e.g. to fetch server suggestions. */
  onQueryChange?: (query: string) => void;
  max: number;
  /** For the limit message: "You can add up to 5 roles." */
  itemName: string;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * Tag input with suggestions (Target roles, Locations, Skills, Exclusions — spec §1).
 * Enter or comma adds; Backspace on empty input removes the last tag; x removes a tag;
 * 2–40 characters; case-insensitive duplicates are ignored; the last suggestion row is always
 * `Add "<text>" as a new tag`.
 */
export function TagInput({
  label,
  hint,
  error,
  value,
  onChange,
  suggestions = [],
  onQueryChange,
  max,
  itemName,
  minLength = 2,
  maxLength = 40,
  placeholder = 'Type and press Enter',
  disabled,
}: TagInputProps) {
  const id = useId();
  const listId = `${id}-list`;
  const messageId = `${id}-message`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);

  const trimmed = query.trim();
  const taken = new Set(value.map((t) => t.toLowerCase()));
  const matches = trimmed
    ? suggestions.filter((s) => s.toLowerCase().includes(trimmed.toLowerCase()) && !taken.has(s.toLowerCase())).slice(0, 6)
    : [];
  const canAddTyped = trimmed.length > 0 && !taken.has(trimmed.toLowerCase()) && !matches.some((m) => m.toLowerCase() === trimmed.toLowerCase());
  const rows = [...matches.map((m) => ({ kind: 'suggestion' as const, text: m })), ...(canAddTyped ? [{ kind: 'new' as const, text: trimmed }] : [])];
  const full = value.length >= max;

  const add = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    if (taken.has(tag.toLowerCase())) {
      setQuery('');
      return; // duplicates are ignored
    }
    if (full) return setLocalError(messages.tagLimit(max, itemName));
    if (tag.length < minLength || tag.length > maxLength) return setLocalError(messages.tagLength);
    onChange([...value, tag]);
    setQuery('');
    setActive(0);
    setLocalError(null);
    onQueryChange?.('');
  };

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
    setLocalError(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      const row = open ? rows[active] : undefined;
      add(row ? row.text : query);
    } else if (event.key === 'Backspace' && query === '' && value.length > 0) {
      remove(value.length - 1);
    } else if (event.key === 'ArrowDown' && rows.length) {
      event.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % rows.length);
    } else if (event.key === 'ArrowUp' && rows.length) {
      event.preventDefault();
      setActive((a) => (a - 1 + rows.length) % rows.length);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const shownError = localError ?? error;
  const message = shownError || hint;
  const expanded = open && rows.length > 0;

  return (
    <div className={fieldStyles.field}>
      {label && (
        <label htmlFor={id} className={fieldStyles.label}>
          {label}
        </label>
      )}
      <div className={styles.wrapper}>
        <div
          className={`${fieldStyles.control} ${styles.control}`}
          data-invalid={shownError ? '' : undefined}
          data-disabled={disabled ? '' : undefined}
        >
          {value.map((tag, index) => (
            <span key={tag} className={styles.tag}>
              {tag}
              <button
                type="button"
                className={styles.remove}
                onClick={() => remove(index)}
                aria-label={`Remove ${tag}`}
                disabled={disabled}
              >
                <X aria-hidden="true" />
              </button>
            </span>
          ))}
          <input
            id={id}
            className={styles.input}
            value={query}
            placeholder={value.length ? '' : placeholder}
            disabled={disabled}
            role="combobox"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={expanded ? `${listId}-${active}` : undefined}
            aria-describedby={message ? messageId : undefined}
            aria-invalid={shownError ? true : undefined}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActive(0);
              setLocalError(null);
              onQueryChange?.(e.target.value);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
          />
        </div>
        {expanded && (
          // ARIA combobox pattern: the popup is a listbox of options (input keeps focus, aria-activedescendant).
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role
          <ul id={listId} role="listbox" className={styles.list}>
            {rows.map((row, index) => (
              <li
                role="option" // oxlint-disable-line jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role
                key={`${row.kind}-${row.text}`}
                id={`${listId}-${index}`}
                aria-selected={index === active}
                className={styles.option}
                data-active={index === active || undefined}
                // mousedown (not click) so the input keeps focus
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(row.text);
                }}
                onMouseEnter={() => setActive(index)}
              >
                {row.kind === 'new' ? `Add "${row.text}" as a new tag` : row.text}
              </li>
            ))}
          </ul>
        )}
      </div>
      {message && (
        <p id={messageId} className={shownError ? fieldStyles.error : fieldStyles.hint} role={shownError ? 'alert' : undefined}>
          {message}
        </p>
      )}
    </div>
  );
}
