import { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from 'openai';

export type LlmErrorCode =
  | 'rate_limited'
  | 'unavailable'
  | 'timeout'
  | 'bad_request'
  | 'auth'
  | 'invalid_output'
  | 'unknown';

export class LlmError extends Error {
  code: LlmErrorCode;
  retryable: boolean;
  /** Seconds-to-ms hint from the `retry-after` header, when the server sent one. */
  retryAfterMs?: number;

  constructor(
    code: LlmErrorCode,
    message: string,
    options: { retryable?: boolean; cause?: unknown; retryAfterMs?: number } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'LlmError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
  }
}

const retryAfterMs = (err: APIError): number | undefined => {
  const value = err.headers?.get('retry-after');
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
};

export const classifyError = (err: unknown): LlmError => {
  if (err instanceof LlmError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const base = { cause: err };

  if (err instanceof APIConnectionTimeoutError) {
    return new LlmError('timeout', message, { ...base, retryable: true });
  }
  // Aborts are the caller's decision, never retried. Order matters: all of these are APIErrors.
  if (err instanceof APIUserAbortError) return new LlmError('unknown', message, base);
  if (err instanceof APIConnectionError) {
    return new LlmError('unavailable', message, { ...base, retryable: true });
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return new LlmError('unknown', message, base);
  }
  if (err instanceof APIError) {
    const status = err.status;
    const hint = retryAfterMs(err);
    const extra = { ...base, ...(hint !== undefined ? { retryAfterMs: hint } : {}) };
    if (status === 429) return new LlmError('rate_limited', message, { ...extra, retryable: true });
    if (status === 401 || status === 403) return new LlmError('auth', message, base);
    if (status === 400) return new LlmError('bad_request', message, base);
    if (status === 503) return new LlmError('unavailable', message, { ...extra, retryable: true });
    if (status === 500 || status === 502 || status === 504) {
      return new LlmError('unavailable', message, { ...extra, retryable: true });
    }
    return new LlmError('unknown', message, base);
  }
  return new LlmError('unknown', message, base);
};
