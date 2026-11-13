import { routeParams } from '@job-pilot/shared/routes';
import { Hono } from 'hono';
import {
  completeFollowUp,
  type PipelineDeps,
} from '../../application/pipeline/pipeline-use-cases.ts';
import type { RateLimitStore } from '../../application/ports/rate-limit-store.ts';
import type { AppEnv } from '../app-env.ts';
import { createRateLimit, rateLimits } from '../middleware/rate-limit.ts';
import { validate } from '../validate.ts';

/** /v1/follow-ups — "Mark follow-up as sent" from the Pipeline row (Review can call it too). */
export const createFollowUpRoutes = (
  deps: Omit<PipelineDeps, 'log'> & { rateLimitStore: RateLimitStore },
) =>
  new Hono<AppEnv>().post(
    '/:id/done',
    createRateLimit(deps.rateLimitStore, rateLimits.pipelineWrite),
    validate('param', routeParams.id),
    async (c) =>
      c.json(
        await completeFollowUp({ ...deps, log: c.var.log }, c.var.user.id, c.req.valid('param').id),
      ),
  );
