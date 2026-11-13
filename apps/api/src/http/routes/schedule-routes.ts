import { routes } from '@job-pilot/shared/routes';
import { Hono } from 'hono';
import type { ScheduleRepository } from '../../application/ports/schedule-repository.ts';
import type { UserRepository } from '../../application/ports/user-repository.ts';
import { getSchedule, putSchedule } from '../../application/schedule/schedule-use-cases.ts';
import type { AppEnv } from '../app-env.ts';
import { validate } from '../validate.ts';

export const createScheduleRoutes = (deps: {
  schedules: ScheduleRepository;
  users: UserRepository;
  now?: () => Date;
}) =>
  new Hono<AppEnv>()
    .get('/', async (c) => c.json(await getSchedule(deps, c.var.user.id)))
    .put('/', validate('json', routes.putSchedule.body), async (c) =>
      c.json(await putSchedule(deps, c.var.user.id, c.req.valid('json'))),
    );
