import { routeParams, routes } from '@job-pilot/shared/routes';
import { Hono } from 'hono';
import {
  changeOpportunityRoute,
  dismissOpportunity,
  pursueOpportunity,
  skipOpportunity,
  type TodayDeps,
} from '../../application/today/today-use-cases.ts';
import type { AppEnv } from '../app-env.ts';
import { validate } from '../validate.ts';

/** Card actions on Today. */
export const createOpportunityRoutes = (deps: TodayDeps) =>
  new Hono<AppEnv>()
    .post('/:id/pursue', validate('param', routeParams.id), async (c) =>
      c.json(await pursueOpportunity(deps, c.var.user.id, c.req.valid('param').id)),
    )
    .post(
      '/:id/skip',
      validate('param', routeParams.id),
      validate('json', routes.skip.body),
      async (c) =>
        c.json(
          await skipOpportunity(deps, c.var.user.id, c.req.valid('param').id, c.req.valid('json')),
        ),
    )
    .post('/:id/dismiss', validate('param', routeParams.id), async (c) =>
      c.json(await dismissOpportunity(deps, c.var.user.id, c.req.valid('param').id)),
    )
    .put(
      '/:id/route',
      validate('param', routeParams.id),
      validate('json', routes.changeOpportunityRoute.body),
      async (c) =>
        c.json(
          await changeOpportunityRoute(
            deps,
            c.var.user.id,
            c.req.valid('param').id,
            c.req.valid('json').route,
          ),
        ),
    );
