import type { Db } from '@job-pilot/db/client';
import { agentRun } from '@job-pilot/db/schema/agent';
import { user } from '@job-pilot/db/schema/auth';
import { schedule } from '@job-pilot/db/schema/profile';
import { ownedBy } from '@job-pilot/db/scoping';
import { and, desc, eq, inArray, not } from 'drizzle-orm';
import type {
  AgentRunRecord,
  AgentRunRepository,
} from '../../application/ports/agent-run-repository.ts';

const toRecord = (r: typeof agentRun.$inferSelect): AgentRunRecord => ({
  id: r.id,
  trigger: r.trigger,
  status: r.status,
  steps: r.steps,
  newCount: r.newCount,
  startedAt: r.startedAt,
  finishedAt: r.finishedAt,
  createdAt: r.createdAt,
});

const active = ['queued', 'running'] as const;

export const createDrizzleAgentRunRepository = (db: Db): AgentRunRepository => ({
  createQueued: async (userId, trigger) => {
    const [row] = await db
      .insert(agentRun)
      .values({ userId, trigger, status: 'queued' })
      .onConflictDoNothing() // agent_run_one_active_per_user
      .returning();
    return row ? toRecord(row) : null;
  },
  markEnqueueFailed: async (runId, error) => {
    await db
      .update(agentRun)
      .set({ status: 'failed', finishedAt: new Date(), error })
      .where(and(eq(agentRun.id, runId), eq(agentRun.status, 'queued')));
  },
  findActive: async (userId) => {
    const [row] = await db
      .select()
      .from(agentRun)
      .where(ownedBy(agentRun, userId, inArray(agentRun.status, active)))
      .orderBy(desc(agentRun.createdAt))
      .limit(1);
    return row ? toRecord(row) : null;
  },
  findLastFinished: async (userId) => {
    const [row] = await db
      .select()
      .from(agentRun)
      .where(ownedBy(agentRun, userId, not(inArray(agentRun.status, active))))
      .orderBy(desc(agentRun.createdAt))
      .limit(1);
    return row ? toRecord(row) : null;
  },
  findOwned: async (userId, id) => {
    const [row] = await db
      .select()
      .from(agentRun)
      .where(ownedBy(agentRun, userId, eq(agentRun.id, id)));
    return row ? toRecord(row) : null;
  },
  getPauseAndNextRun: async (userId) => {
    const [row] = await db
      .select({ pausedAt: user.pausedAt, nextRunAt: schedule.nextRunAt })
      .from(user)
      .leftJoin(schedule, eq(schedule.userId, user.id))
      .where(eq(user.id, userId));
    return { paused: row?.pausedAt != null, nextRunAt: row?.nextRunAt ?? null };
  },
});
