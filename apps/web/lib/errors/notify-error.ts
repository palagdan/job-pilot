import { toast } from '../../components/ui/toast.tsx';
import { ApiError } from '../api/api-client.ts';
import { isHandledGlobally } from './global-errors.ts';

/**
 * Error toast for a failed action (spec §8 "Toasts - errors"), unless a global window already explains it
 * (E03 session, E11 rate limit, E12 server error) — so the user never sees both.
 */
export const notifyError = (error: unknown, fallback: string, options: { retry?: () => void } = {}) => {
  if (isHandledGlobally(error)) return;
  toast.error(error instanceof ApiError && error.code !== 'network' ? error.message : fallback, options);
};
