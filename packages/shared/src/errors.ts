import { z } from 'zod';

/**
 * Error codes returned by the api. The web maps them to the spec's error windows (E01-E12) and toasts.
 * Validation errors carry per-field messages in `fields`.
 */
export const errorCodes = [
  'validation_failed', // 400 - inline field errors
  'unauthorized', // 401 - E03 Session expired
  'forbidden', // 403
  'not_found', // 404
  'conflict', // 409 - e.g. a run is already in progress
  'payload_too_large', // 413 - CV over 5 MB
  'unsupported_media_type', // 415 - not PDF/DOCX
  'rate_limited', // 429 - E11
  'cv_unreadable', // 422 - E04
  'agent_busy', // 409 - "The agent is busy with a run"
  'posting_unavailable', // 410 - E07
  'internal', // 500 - E12
  'maintenance', // 503
] as const;
export type ErrorCode = (typeof errorCodes)[number];

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(errorCodes),
    message: z.string(),
    /** Shown to the user as "Error code: JP-500-a1b2c3" for 5xx (E12). */
    requestId: z.string(),
    /** Field path (dot notation) → message, for `validation_failed`. */
    fields: z.record(z.string(), z.string()).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const errorStatus: Record<ErrorCode, number> = {
  validation_failed: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  cv_unreadable: 422,
  agent_busy: 409,
  posting_unavailable: 410,
  internal: 500,
  maintenance: 503,
};

/** "JP-500-a1b2c3" */
export const formatErrorCode = (status: number, requestId: string): string =>
  `JP-${status}-${requestId.slice(0, 6)}`;

/**
 * Expected failure thrown by use cases ("not found", "agent busy", validation...). Carries a shared error code
 * and a user-facing message; the api maps it to `apiErrorSchema` with `errorStatus[code]`. Anything that is not
 * an `AppError` is treated as a bug → 500 `internal`.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fields: Record<string, string> | undefined;

  constructor(code: ErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.fields = fields;
  }
}
