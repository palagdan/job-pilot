import { Hono } from 'hono';
import {
  type AgentDeps,
  getAgentStatus,
  pauseAgent,
  resumeAgent,
} from '../../application/agent/agent-use-cases.ts';
import type { AppEnv } from '../app-env.ts';

/** /v1/agent — status (banners, Settings) and pause/resume (C07). Run now and run progress are Daniil's (M3). */
export const createAgentRoutes = (deps: AgentDeps) =>
  new Hono<AppEnv>()
    .get('/status', async (c) => c.json(await getAgentStatus(deps, c.var.user.id)))
    .post('/pause', async (c) => c.json(await pauseAgent(deps, c.var.user.id)))
    .post('/resume', async (c) => c.json(await resumeAgent(deps, c.var.user.id)));
