import type { Db } from '@job-pilot/db/client';
import { user } from '@job-pilot/db/schema/auth';
import { eq } from 'drizzle-orm';
import type { AgentRepository } from '../../application/ports/agent-repository.ts';

export const createDrizzleAgentRepository = (db: Db): AgentRepository => ({
  setPaused: async (userId, pausedAt) => {
    await db.update(user).set({ pausedAt }).where(eq(user.id, userId));
  },
});
