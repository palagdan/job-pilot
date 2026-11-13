import type { AgentStatus } from '@job-pilot/shared/agent-run';
import { nextRunAt } from '@job-pilot/shared/next-run';
import { loadUser } from '../onboarding/onboarding-rules.ts';
import type { AgentRepository } from '../ports/agent-repository.ts';
import type { ScheduleRepository } from '../ports/schedule-repository.ts';
import type { UserRepository } from '../ports/user-repository.ts';
import { type AgentDeps, getAgentStatus } from './agent-use-cases.ts';

export type PauseDeps = AgentDeps & {
  agent: AgentRepository;
  schedules: ScheduleRepository;
  users: UserRepository;
};

const clock = (deps: { now?: () => Date }) => (deps.now ?? (() => new Date()))();

/** C07 "Pause your agent?" — no runs and no emails until resumed. Idempotent. */
export async function pauseAgent(deps: PauseDeps, userId: string): Promise<AgentStatus> {
  const user = await loadUser(deps.users, userId);
  if (!user.pausedAt) await deps.agent.setPaused(userId, clock(deps));
  return getAgentStatus(deps, userId);
}

/**
 * Resume: clears the pause and moves the next run to the next slot from now (runs missed while paused are not
 * made up in a burst). Idempotent.
 */
export async function resumeAgent(deps: PauseDeps, userId: string): Promise<AgentStatus> {
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
