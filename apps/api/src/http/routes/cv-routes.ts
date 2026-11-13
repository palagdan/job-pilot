import { routeParams, routes } from '@job-pilot/shared/routes';
import { Hono } from 'hono';
import {
  type CvDeps,
  compareCv,
  confirmCv,
  deleteCv,
  downloadCv,
  editCv,
  getCv,
  keepOriginalCv,
  listCvs,
  regenerateCv,
} from '../../application/cvs/cv-use-cases.ts';
import type { RateLimitStore } from '../../application/ports/rate-limit-store.ts';
import type { AppEnv } from '../app-env.ts';
import { createRateLimit, rateLimits } from '../middleware/rate-limit.ts';
import { validate } from '../validate.ts';

/** CVs page, 06 New CV, Review > Special CV. `/keep-original` is registered before `/:id`. */
export const createCvRoutes = (deps: Omit<CvDeps, 'log'> & { rateLimitStore: RateLimitStore }) =>
  new Hono<AppEnv>()
    .get('/', async (c) => c.json(await listCvs(deps, c.var.user.id)))
    .post('/keep-original', async (c) => c.json(await keepOriginalCv(deps, c.var.user.id)))
    .get('/:id', validate('param', routeParams.id), async (c) =>
      c.json(await getCv(deps, c.var.user.id, c.req.valid('param').id)),
    )
    .post('/:id/confirm', validate('param', routeParams.id), async (c) =>
      c.json(await confirmCv(deps, c.var.user.id, c.req.valid('param').id)),
    )
    .put(
      '/:id/content',
      validate('param', routeParams.id),
      validate('json', routes.editCv.body),
      async (c) =>
        c.json(
          await editCv(deps, c.var.user.id, c.req.valid('param').id, c.req.valid('json').content),
        ),
    )
    .post(
      '/:id/regenerate',
      createRateLimit(deps.rateLimitStore, rateLimits.regenerateCv),
      validate('param', routeParams.id),
      async (c) => c.json(await regenerateCv(deps, c.var.user.id, c.req.valid('param').id)),
    )
    .delete('/:id', validate('param', routeParams.id), async (c) => {
      await deleteCv({ ...deps, log: c.var.log }, c.var.user.id, c.req.valid('param').id);
      return c.json({ ok: true as const });
    })
    .get(
      '/:id/compare',
      validate('param', routeParams.id),
      validate('query', routes.compareCv.query),
      async (c) =>
        c.json(
          await compareCv(deps, c.var.user.id, c.req.valid('param').id, c.req.valid('query').with),
        ),
    )
    .get(
      '/:id/download',
      validate('param', routeParams.id),
      validate('query', routes.downloadCv.query),
      async (c) =>
        c.json(
          await downloadCv(
            deps,
            c.var.user.id,
            c.req.valid('param').id,
            c.req.valid('query').format,
          ),
        ),
    );
