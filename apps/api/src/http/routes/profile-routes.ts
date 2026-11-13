import { routes } from '@job-pilot/shared/routes';
import { Hono } from 'hono';
import type { ProfileRepository } from '../../application/ports/profile-repository.ts';
import type { UserRepository } from '../../application/ports/user-repository.ts';
import {
  getProfile,
  patchProfile,
  putProfile,
} from '../../application/profile/profile-use-cases.ts';
import type { AppEnv } from '../app-env.ts';
import { validate } from '../validate.ts';

export const createProfileRoutes = (deps: { profiles: ProfileRepository; users: UserRepository }) =>
  new Hono<AppEnv>()
    .get('/', async (c) => c.json(await getProfile(deps, c.var.user.id)))
    .put('/', validate('json', routes.putProfile.body), async (c) =>
      c.json(await putProfile(deps, c.var.user.id, c.req.valid('json'))),
    )
    .patch('/', validate('json', routes.patchProfile.body), async (c) =>
      c.json(await patchProfile(deps, c.var.user.id, c.req.valid('json'))),
    );
