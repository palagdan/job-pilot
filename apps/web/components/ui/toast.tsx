'use client';

import { X } from 'lucide-react';
import { Toast as T } from 'radix-ui';
import { type ReactNode, useSyncExternalStore } from 'react';
import styles from './toast.module.css';

/**
 * Toasts (spec §8): bottom-center, one at a time (queued).
 * Success/info hide after 4 s, 10 s when they have Undo; errors stay until closed or retried.
 *
 *   toast('Saved')
 *   toast('Skipped', { undo: () => api.undo(token) })
 *   toast.error('Could not save. Check your connection.', { retry: save })
 */
type ToastItem = {
  id: number;
  message: ReactNode;
  tone: 'default' | 'error';
  action?: { label: string; onAction: () => void };
  duration: number;
};

let queue: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

const push = (item: Omit<ToastItem, 'id'>) => {
  queue = [...queue, { ...item, id: nextId++ }];
  emit();
};

const dismiss = (id: number) => {
  queue = queue.filter((t) => t.id !== id);
  emit();
};

export function toast(message: ReactNode, options: { undo?: () => void; action?: ToastItem['action'] } = {}) {
  const action = options.undo ? { label: 'Undo', onAction: options.undo } : options.action;
  push({ message, tone: 'default', action, duration: action ? 10_000 : 4_000 });
}

toast.error = (message: ReactNode, options: { retry?: () => void } = {}) => {
  push({
    message,
    tone: 'error',
    action: options.retry ? { label: 'Retry', onAction: options.retry } : undefined,
    duration: Number.POSITIVE_INFINITY,
  });
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => queue;
const empty: ToastItem[] = [];

/** Mount once (in providers). */
export function Toaster() {
  const items = useSyncExternalStore(subscribe, getSnapshot, () => empty);
  const current = items[0];

  return (
    <T.Provider swipeDirection="down">
      {current && (
        <T.Root
          key={current.id}
          className={styles.toast}
          data-tone={current.tone}
          duration={current.duration}
          onOpenChange={(open) => !open && dismiss(current.id)}
          type={current.tone === 'error' ? 'foreground' : 'background'}
        >
          <T.Description className={styles.message}>{current.message}</T.Description>
          {current.action && (
            <T.Action
              className={styles.action}
              altText={current.action.label}
              onClick={() => current.action?.onAction()}
            >
              {current.action.label}
            </T.Action>
          )}
          {current.tone === 'error' && (
            <T.Close className={styles.close} aria-label="Close">
              <X aria-hidden="true" />
            </T.Close>
          )}
        </T.Root>
      )}
      <T.Viewport className={styles.viewport} />
    </T.Provider>
  );
}
