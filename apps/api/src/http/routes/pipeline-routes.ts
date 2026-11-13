import { routeParams, routes } from '@job-pilot/shared/routes';
import { Hono } from 'hono';
import { getPipelineStats } from '../../application/pipeline/pipeline-stats.ts';
import {
  addNote,
  changePipelineRoute,
  getPipelineItem,
  listNotes,
  listPipeline,
  type PipelineDeps,
  stopPursuing,
  updatePipelineStatus,
} from '../../application/pipeline/pipeline-use-cases.ts';
import type { RateLimitStore } from '../../application/ports/rate-limit-store.ts';
import type { AppEnv } from '../app-env.ts';
import { createRateLimit, rateLimits } from '../middleware/rate-limit.ts';
import { validate } from '../validate.ts';

const id = validate('param', routeParams.id);

/**
 * /v1/pipeline — 10 Pipeline: list (filters, sort), stats, row actions and notes (Artem).
 * Pack endpoints on the same prefix (drafts, sent, registered, retry, .ics) are Daniil's.
 */
export const createPipelineRoutes = (
  deps: Omit<PipelineDeps, 'log'> & { rateLimitStore: RateLimitStore },
) => {
  const write = createRateLimit(deps.rateLimitStore, rateLimits.pipelineWrite);
  return new Hono<AppEnv>()
    .get('/', validate('query', routes.listPipeline.query), async (c) =>
      c.json(await listPipeline({ ...deps, log: c.var.log }, c.var.user.id, c.req.valid('query'))),
    )
    .get('/stats', async (c) => c.json(await getPipelineStats(deps, c.var.user.id)))
    .get('/:id', id, async (c) =>
      c.json(
        await getPipelineItem({ ...deps, log: c.var.log }, c.var.user.id, c.req.valid('param').id),
      ),
    )
    .put('/:id/status', write, id, validate('json', routes.updatePipelineStatus.body), async (c) =>
      c.json(
        await updatePipelineStatus(
          { ...deps, log: c.var.log },
          c.var.user.id,
          c.req.valid('param').id,
          c.req.valid('json'),
        ),
      ),
    )
    .put('/:id/route', write, id, validate('json', routes.changePipelineRoute.body), async (c) =>
      c.json(
        await changePipelineRoute(
          { ...deps, log: c.var.log },
          c.var.user.id,
          c.req.valid('param').id,
          c.req.valid('json').route,
        ),
      ),
    )
    .post('/:id/stop', write, id, async (c) =>
      c.json(
        await stopPursuing({ ...deps, log: c.var.log }, c.var.user.id, c.req.valid('param').id),
      ),
    )
    .get('/:id/notes', id, async (c) =>
      c.json(await listNotes({ ...deps, log: c.var.log }, c.var.user.id, c.req.valid('param').id)),
    )
    .post('/:id/notes', write, id, validate('json', routes.addNote.body), async (c) =>
      c.json(
        await addNote(
          { ...deps, log: c.var.log },
          c.var.user.id,
          c.req.valid('param').id,
          c.req.valid('json').body,
        ),
        201,
      ),
    );
};
