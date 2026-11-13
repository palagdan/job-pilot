import { routes } from '@job-pilot/shared/routes';
import { Hono } from 'hono';
import { type TodayDeps, undo } from '../../application/today/today-use-cases.ts';
import type { AppEnv } from '../app-env.ts';
import { validate } from '../validate.ts';

/** Generic toast Undo. */
export const createUndoRoutes = (deps: Pick<TodayDeps, 'today' | 'now'>) =>
  new Hono<AppEnv>().post('/', validate('json', routes.undo.body), async (c) =>
    c.json(await undo(deps, c.var.user.id, c.req.valid('json').undoToken)),
  );
