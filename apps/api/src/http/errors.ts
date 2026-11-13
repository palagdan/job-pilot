import { type ApiError, type ErrorCode, errorStatus } from '@job-pilot/shared/errors';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppEnv } from './app-env.ts';

/** Every api error response goes through here, so the shape always matches `apiErrorSchema`. */
export const apiError = (
  c: Context<AppEnv>,
  code: ErrorCode,
  message: string,
  fields?: Record<string, string>,
) => {
  const body: ApiError = {
    error: { code, message, requestId: c.get('requestId'), ...(fields ? { fields } : {}) },
  };
  return c.json(body, errorStatus[code] as ContentfulStatusCode);
};
