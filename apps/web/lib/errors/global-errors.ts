import { formatErrorCode } from '@job-pilot/shared/errors';
import { ApiError } from '../api/api-client.ts';

/**
 * App-wide error windows (spec §6) that any request can trigger:
 * - E03 Session expired (401), E11 Too many requests (429), E12 Generic error (5xx, with the support code).
 * Raised from the TanStack Query caches (`query-client.ts`); shown by <GlobalErrorDialogs/>.
 */
export type GlobalError =
  | { kind: 'session' }
  | { kind: 'rate-limited' }
  | { kind: 'server'; code: string | null; retry?: () => void };

let current: GlobalError | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

export const globalErrors = {
  get: () => current,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** E03 wins over everything; otherwise the first window stays until closed. */
  show: (error: GlobalError) => {
    if (current && current.kind === 'session') return;
    if (current && error.kind !== 'session') return;
    current = error;
    emit();
  },
  clear: () => {
    if (current?.kind === 'session') return; // E03 can only be left by signing in
    current = null;
    emit();
  },
};

/** True for errors the global windows already explain (so screens should not toast them again). */
export const isHandledGlobally = (error: unknown): boolean =>
  error instanceof ApiError && (error.code === 'unauthorized' || error.code === 'rate_limited' || error.status >= 500);

/** Routes an api error to the matching window. Returns whether it was handled. */
export const raiseGlobalError = (error: unknown, retry?: () => void): boolean => {
  if (!(error instanceof ApiError)) return false;
  if (error.code === 'unauthorized') globalErrors.show({ kind: 'session' });
  else if (error.code === 'rate_limited') globalErrors.show({ kind: 'rate-limited' });
  else if (error.status >= 500) {
    globalErrors.show({ kind: 'server', code: error.requestId ? formatErrorCode(error.status, error.requestId) : null, retry });
  } else return false;
  return true;
};
