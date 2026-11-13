import { Hono } from 'hono';
import { getPipelineStats } from '../../application/pipeline/pipeline-stats.ts';
import type { PipelineRepository } from '../../application/ports/pipeline-repository.ts';
import type { AppEnv } from '../app-env.ts';

/** /v1/pipeline — only the stats row for now (list, filters and row actions are the M4 Pipeline item). */
export const createPipelineRoutes = (deps: { pipeline: PipelineRepository }) =>
  new Hono<AppEnv>().get('/stats', async (c) =>
    c.json(await getPipelineStats(deps, c.var.user.id)),
  );
