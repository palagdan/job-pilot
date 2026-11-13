import { Hono } from 'hono';
import { getAgentStatus, startRun } from '../../application/agent/agent-use-cases.ts';
import { type PauseDeps, pauseAgent, resumeAgent } from '../../application/agent/pause-resume.ts';
import type { RateLimitStore } from '../../application/ports/rate-limit-store.ts';
import type { AppEnv } from '../app-env.ts';
import { createRateLimit, rateLimits } from '../middleware/rate-limit.ts';

/** /v1/agent — status, "Run now" (Daniil), pause/resume C07 (Artem). Run events SSE: not built, clients poll `/status`. */
export const createAgentRoutes = (
  deps: Omit<PauseDeps, 'log'> & { rateLimitStore: RateLimitStore },
) =>
  new Hono<AppEnv>()
    .get('/status', async (c) =>
      c.json(await getAgentStatus({ ...deps, log: c.var.log }, c.var.user.id)),
    )
    .post('/runs', createRateLimit(deps.rateLimitStore, rateLimits.runNow), async (c) =>
      c.json(await startRun({ ...deps, log: c.var.log }, c.var.user.id), 201),
    )
    .post('/pause', async (c) =>
      c.json(await pauseAgent({ ...deps, log: c.var.log }, c.var.user.id)),
    )
    .post('/resume', async (c) =>
      c.json(await resumeAgent({ ...deps, log: c.var.log }, c.var.user.id)),
    );
