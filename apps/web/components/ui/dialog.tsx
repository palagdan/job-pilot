'use client';

import { Dialog as D } from 'radix-ui';
import { type ReactNode, useState } from 'react';
import { Button } from './button.tsx';
import fieldStyles from './field.module.css';
import styles from './dialog.module.css';

/**
 * Modal (Figma "Modal"): error windows E01–E12 and confirmations C01–C10.
 * Esc and a click outside close it unless `dismissible` is false (e.g. E03 Session expired).
 * Actions: the last one is the main action (spec §6).
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  tone = 'default',
  children,
  actions,
  dismissible = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  tone?: 'default' | 'danger';
  children?: ReactNode;
  actions: ReactNode;
  dismissible?: boolean;
}) {
  const block = (e: Event) => {
    if (!dismissible) e.preventDefault();
  };
  return (
    <D.Root open={open} onOpenChange={(next) => (dismissible || next ? onOpenChange(next) : undefined)}>
      <D.Portal>
        <D.Overlay className={styles.overlay} />
        <D.Content className={styles.modal} onEscapeKeyDown={block} onPointerDownOutside={block} onInteractOutside={block}>
          <D.Title className={styles.title} data-tone={tone}>
            {title}
          </D.Title>
          {description ? (
            <D.Description className={styles.description}>{description}</D.Description>
          ) : (
            <D.Description className={styles.srOnly}>{title}</D.Description>
          )}
          {children}
          <div className={styles.actions}>{actions}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/**
 * Confirmation dialog (C01–C10). `onConfirm` may be async: the main button shows loading until it resolves,
 * then the dialog closes. `requireText` (C09 "Type DELETE") enables the main button only on an exact match.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  requireText,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  tone?: 'default' | 'danger';
  /** May return a promise (e.g. `mutation.mutateAsync`); its value is ignored. Rejections keep the dialog open. */
  onConfirm: () => unknown;
  requireText?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  const blocked = requireText !== undefined && typed !== requireText;

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
      setTyped('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) setTyped('');
        onOpenChange(next);
      }}
      title={title}
      description={description}
      tone={tone}
      actions={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={confirm} loading={busy} disabled={blocked}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {requireText !== undefined && (
        <input
          className={fieldStyles.control}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={`Type ${requireText}`}
          aria-label={`Type ${requireText} to confirm`}
          autoComplete="off"
        />
      )}
    </Modal>
  );
}
