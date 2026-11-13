import { zValidator } from '@hono/zod-validator';
import type { Context, ValidationTargets } from 'hono';
import type { z } from 'zod';
import { fieldErrors } from '../application/shared/zod-errors.ts';
import type { AppEnv } from './app-env.ts';
import { apiError } from './errors.ts';

/**
 * Request validation with the shared schemas: `validate('json', profileInputSchema)`.
 * Failures → 400 `validation_failed` with per-field messages; handlers read `c.req.valid('json')`.
 */
export const validate = <Target extends keyof ValidationTargets, Schema extends z.ZodType>(
  target: Target,
  schema: Schema,
) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      // The hook's context is untyped; our middleware chain guarantees AppEnv variables (requestId).
      return apiError(
        c as unknown as Context<AppEnv>,
        'validation_failed',
        'Check the highlighted fields.',
        fieldErrors(result.error),
      );
    }
  });
