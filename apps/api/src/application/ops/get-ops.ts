import { AppError } from '@job-pilot/shared/errors';
import type { Ops } from '@job-pilot/shared/ops';
import type { OpsReader } from '../ports/ops-reader.ts';

export const opsWindowDays = 7;

/** GET /v1/admin/ops — only for emails listed in `ADMIN_EMAILS` (others get 403, the web shows No access). */
export async function getOps(
  deps: { ops: OpsReader; admins: readonly string[]; now?: () => Date },
  viewer: { email: string },
): Promise<Ops> {
  if (!deps.admins.includes(viewer.email.toLowerCase()))
    throw new AppError('forbidden', 'This page is for the JobPilot team.');
  const now = (deps.now ?? (() => new Date()))();
  const since = new Date(now.getTime() - opsWindowDays * 24 * 60 * 60 * 1000);
  return {
    windowDays: opsWindowDays,
    generatedAt: now.toISOString(),
    ...(await deps.ops.summary(since, now)),
  };
}
