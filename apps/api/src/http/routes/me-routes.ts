import { routes } from '@job-pilot/shared/routes';
import { Hono } from 'hono';
import { getMe } from '../../application/me/get-me.ts';
import type { UserRepository } from '../../application/ports/user-repository.ts';
import { updateSettings } from '../../application/settings/update-settings.ts';
import type { AppEnv } from '../app-env.ts';
import { apiError } from '../errors.ts';
import { validate } from '../validate.ts';

export const createMeRoutes = (deps: { users: UserRepository }) =>
  new Hono<AppEnv>()
    .get('/', async (c) => {
      const me = await getMe(deps, c.var.user.id);
      // Session outlived its user (e.g. deleted) — treat as signed out.
      if (!me) return apiError(c, 'unauthorized', 'Sign in to continue.');
      return c.json(me);
    })
    .patch('/settings', validate('json', routes.updateSettings.body), async (c) =>
      c.json(await updateSettings(deps, c.var.user.id, c.req.valid('json'))),
    );
