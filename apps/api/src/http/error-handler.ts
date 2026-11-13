import type { Logger } from '@job-pilot/logger/logger';
import { AppError, type ErrorCode } from '@job-pilot/shared/errors';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './app-env.ts';
import { apiError } from './errors.ts';

/** HTTP statuses Hono or its middleware may raise themselves (body limit, malformed JSON...). */
const statusToCode: Record<number, ErrorCode> = {
  400: 'validation_failed',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  429: 'rate_limited',
  503: 'maintenance',
};

/**
 * `app.onError`. Expected errors (`AppError`, `HTTPException`) keep their code; anything else is a bug:
 * logged with stack, answered with 500 `internal` + requestId (web shows "Error code: JP-500-xxxxxx", E12).
 */
export const createErrorHandler = (log: Logger) => (error: Error, c: Context<AppEnv>) => {
  if (error instanceof AppError) return apiError(c, error.code, error.message, error.fields);

  if (error instanceof HTTPException && statusToCode[error.status]) {
    return apiError(c, statusToCode[error.status] as ErrorCode, error.message || 'Request failed.');
  }

  (c.get('log') ?? log).error('unhandled error', { error, method: c.req.method, path: c.req.path });
  return apiError(c, 'internal', 'Something went wrong on our side.');
};
