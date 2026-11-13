import { routes } from '@job-pilot/shared/routes';
import { Hono } from 'hono';
import type { RateLimitStore } from '../../application/ports/rate-limit-store.ts';
import {
  getVapidKey,
  type PushDeps,
  subscribePush,
  unsubscribePush,
} from '../../application/push/push-use-cases.ts';
import type { AppEnv } from '../app-env.ts';
import { createRateLimit, rateLimits } from '../middleware/rate-limit.ts';
import { validate } from '../validate.ts';

/** /v1/push — Web Push key and this browser's subscription (spec: push only when a pack is ready). */
export const createPushRoutes = (deps: PushDeps & { rateLimitStore: RateLimitStore }) => {
  const limit = createRateLimit(deps.rateLimitStore, rateLimits.push);
  return new Hono<AppEnv>()
    .get('/vapid-key', (c) => c.json(getVapidKey(deps)))
    .post('/subscriptions', limit, validate('json', routes.subscribePush.body), async (c) =>
      c.json(
        await subscribePush(
          deps,
          c.var.user.id,
          c.req.valid('json'),
          c.req.header('user-agent') ?? null,
        ),
      ),
    )
    .delete('/subscriptions', limit, validate('json', routes.unsubscribePush.body), async (c) =>
      c.json(await unsubscribePush(deps, c.var.user.id, c.req.valid('json').endpoint)),
    );
};
