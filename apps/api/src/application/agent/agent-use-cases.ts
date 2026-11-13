import type { AgentRun, AgentStatus } from '@job-pilot/shared/agent-run';
import { nextRunAt } from '@job-pilot/shared/next-run';
import { loadUser } from '../onboarding/onboarding-rules.ts';
import type { AgentRepository, AgentRunRecord } from '../ports/agent-repository.ts';
import type { ScheduleRepository } from '../ports/schedule-repository.ts';
import type { UserRepository } from '../ports/user-repository.ts';

export type AgentDeps = {
  agent: AgentRepository;
  schedules: ScheduleRepository;
  users: UserRepository;
  now?: () => Date;
};

/** Spec §10: runs longer than 10 minutes show "This is taking longer than usual". */
export const slowAfterMs = 10 * 60 * 1000;

const clock = (deps: { now?: () => Date }) => (deps.now ?? (() => new Date()))();

const toRun = (r: AgentRunRecord, now: Date): AgentRun => ({
  id: r.id,
  trigger: r.trigger,
  status: r.status,
  steps: r.steps,
  newCount: r.newCount,
  startedAt: r.startedAt?.toISOString() ?? null,
  finishedAt: r.finishedAt?.toISOString() ?? null,
  slow:
    r.status === 'running' &&
    r.startedAt !== null &&
    now.getTime() - r.startedAt.getTime() > slowAfterMs,
});

/** GET /v1/agent/status — paused?, current run, last run, next scheduled run (banners on Today, Settings). */
export async function getAgentStatus(deps: AgentDeps, userId: string): Promise<AgentStatus> {
  const user = await loadUser(deps.users, userId);
  const [current, last, schedule] = await Promise.all([
    deps.agent.currentRun(userId),
    deps.agent.lastRun(userId),
    deps.schedules.get(userId),
  ]);
  const now = clock(deps);
  return {
    paused: user.pausedAt !== null,
    currentRun: current ? toRun(current, now) : null,
    lastRun: last ? toRun(last, now) : null,
    nextRunAt: user.pausedAt ? null : (schedule?.nextRunAt?.toISOString() ?? null),
  };
}

/** C07 "Pause your agent?" — no runs and no emails until resumed. Idempotent. */
export async function pauseAgent(deps: AgentDeps, userId: string): Promise<AgentStatus> {
  const user = await loadUser(deps.users, userId);
  if (!user.pausedAt) await deps.agent.setPaused(userId, clock(deps));
  return getAgentStatus(deps, userId);
}

/**
 * Resume: clears the pause and moves the next run to the next slot from now (runs missed while paused are not
 * made up in a burst). Idempotent.
 */
export async function resumeAgent(deps: AgentDeps, userId: string): Promise<AgentStatus> {
  const user = await loadUser(deps.users, userId);
  if (user.pausedAt) {
    await deps.agent.setPaused(userId, null);
    const schedule = await deps.schedules.get(userId);
    if (schedule) {
      await deps.schedules.setNextRunAt(
        userId,
        nextRunAt({ ...schedule, timezone: user.timezone }, clock(deps), schedule.lastRunAt),
      );
    }
  }
  return getAgentStatus(deps, userId);
}
