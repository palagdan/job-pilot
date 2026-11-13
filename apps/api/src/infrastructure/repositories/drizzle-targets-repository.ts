import type { Db } from '@job-pilot/db/client';
import { targets } from '@job-pilot/db/schema/profile';
import type { Targets } from '@job-pilot/shared/targets';
import { eq } from 'drizzle-orm';
import type { TargetsRepository } from '../../application/ports/targets-repository.ts';

const toTargets = (r: typeof targets.$inferSelect): Targets => ({
  roles: r.roles,
  locations: r.locations,
  workFormats: r.workFormats,
  exclusions: r.exclusions,
  findJobs: r.findJobs,
  findEvents: r.findEvents,
});

export const createDrizzleTargetsRepository = (db: Db): TargetsRepository => ({
  get: async (userId) => {
    const [row] = await db.select().from(targets).where(eq(targets.userId, userId));
    return row ? toTargets(row) : null;
  },
  save: async (userId, t) => {
    const [row] = await db
      .insert(targets)
      .values({ userId, ...t })
      .onConflictDoUpdate({ target: targets.userId, set: t })
      .returning();
    if (!row) throw new Error('targets upsert returned no row');
    return toTargets(row);
  },
});
