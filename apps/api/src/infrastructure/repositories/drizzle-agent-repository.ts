import type { Db } from '@job-pilot/db/client';
import { agentRun } from '@job-pilot/db/schema/agent';
import { user } from '@job-pilot/db/schema/auth';
import { ownedBy } from '@job-pilot/db/scoping';
import { desc, eq, inArray } from 'drizzle-orm';
import type { AgentRepository } from '../../application/ports/agent-repository.ts';

const columns = {
  id: agentRun.id,
  trigger: agentRun.trigger,
  status: agentRun.status,
  steps: agentRun.steps,
  newCount: agentRun.newCount,
  startedAt: agentRun.startedAt,
  finishedAt: agentRun.finishedAt,
};

export const createDrizzleAgentRepository = (db: Db): AgentRepository => ({
  currentRun: async (userId) => {
    const [row] = await db
      .select(columns)
      .from(agentRun)
      .where(ownedBy(agentRun, userId, inArray(agentRun.status, ['queued', 'running'])))
      .limit(1);
    return row ?? null;
  },
  lastRun: async (userId) => {
    const [row] = await db
      .select(columns)
      .from(agentRun)
      .where(
        ownedBy(agentRun, userId, inArray(agentRun.status, ['succeeded', 'failed', 'cancelled'])),
      )
      .orderBy(desc(agentRun.createdAt))
      .limit(1);
    return row ?? null;
  },
  setPaused: async (userId, pausedAt) => {
    await db.update(user).set({ pausedAt }).where(eq(user.id, userId));
  },
});
