import { Hono } from 'hono';
import { getOps } from '../../application/ops/get-ops.ts';
import type { OpsReader } from '../../application/ports/ops-reader.ts';
import type { AppEnv } from '../app-env.ts';

/** /v1/admin — the JobPilot team only (`ADMIN_EMAILS`). */
export const createAdminRoutes = (deps: {
  ops: OpsReader;
  admins: readonly string[];
  now?: () => Date;
}) => new Hono<AppEnv>().get('/ops', async (c) => c.json(await getOps(deps, c.var.user)));
