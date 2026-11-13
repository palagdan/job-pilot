import { routes } from '@job-pilot/shared/routes';
import { Hono } from 'hono';
import { getToday, type TodayDeps } from '../../application/today/today-use-cases.ts';
import type { AppEnv } from '../app-env.ts';
import { validate } from '../validate.ts';

/** 07 Today feed. */
export const createTodayRoutes = (deps: Pick<TodayDeps, 'today' | 'now'>) =>
  new Hono<AppEnv>().get('/', validate('query', routes.getToday.query), async (c) =>
    c.json(await getToday(deps, c.var.user.id, c.req.valid('query').type)),
  );
