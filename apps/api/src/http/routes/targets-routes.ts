import { routes } from '@job-pilot/shared/routes';
import { Hono } from 'hono';
import type { TargetsRepository } from '../../application/ports/targets-repository.ts';
import type { UserRepository } from '../../application/ports/user-repository.ts';
import {
  getTargets,
  patchTargets,
  putTargets,
} from '../../application/targets/targets-use-cases.ts';
import type { AppEnv } from '../app-env.ts';
import { validate } from '../validate.ts';

export const createTargetsRoutes = (deps: { targets: TargetsRepository; users: UserRepository }) =>
  new Hono<AppEnv>()
    .get('/', async (c) => c.json(await getTargets(deps, c.var.user.id)))
    .put('/', validate('json', routes.putTargets.body), async (c) =>
      c.json(await putTargets(deps, c.var.user.id, c.req.valid('json'))),
    )
    .patch('/', validate('json', routes.patchTargets.body), async (c) =>
      c.json(await patchTargets(deps, c.var.user.id, c.req.valid('json'))),
    );
