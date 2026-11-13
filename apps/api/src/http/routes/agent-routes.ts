import { Hono } from 'hono';
import {
  type AgentDeps,
  getAgentStatus,
  startRun,
} from '../../application/agent/agent-use-cases.ts';
import type { RateLimitStore } from '../../application/ports/rate-limit-store.ts';
import type { AppEnv } from '../app-env.ts';
import { createRateLimit, rateLimits } from '../middleware/rate-limit.ts';

/** Agent status and "Run now". (Pause/resume: Artem. Run events SSE: not built, clients poll `/status`.) */
export const createAgentRoutes = (
  deps: Omit<AgentDeps, 'log'> & { rateLimitStore: RateLimitStore },
) =>
  new Hono<AppEnv>()
    .get('/status', async (c) =>
      c.json(await getAgentStatus({ ...deps, log: c.var.log }, c.var.user.id)),
    )
    .post('/runs', createRateLimit(deps.rateLimitStore, rateLimits.runNow), async (c) =>
      c.json(await startRun({ ...deps, log: c.var.log }, c.var.user.id), 201),
    );
