import type { Logger } from '@job-pilot/logger/logger';
import type { AgentRun, AgentStatus } from '@job-pilot/shared/agent-run';
import { runStepKeys } from '@job-pilot/shared/enums';
import { AppError } from '@job-pilot/shared/errors';
import type { AgentRunRecord, AgentRunRepository } from '../ports/agent-run-repository.ts';
import type { AgentJobQueue } from '../ports/job-queue.ts';

export type AgentDeps = {
  runs: AgentRunRepository;
  agentJobs: AgentJobQueue;
  log: Logger;
  now?: () => Date;
};

const clock = (deps: { now?: () => Date }) => (deps.now ?? (() => new Date()))();

/** "This is taking longer than usual" after 10 minutes. */
const SLOW_AFTER_MS = 10 * 60_000;

const isActive = (r: AgentRunRecord) => r.status === 'queued' || r.status === 'running';

export const toRunDto = (r: AgentRunRecord, now: Date): AgentRun => ({
  id: r.id,
  trigger: r.trigger,
  status: r.status,
  steps: r.steps.length ? r.steps : runStepKeys.map((key) => ({ key, status: 'waiting' as const })),
  newCount: r.newCount,
  startedAt: r.startedAt?.toISOString() ?? null,
  finishedAt: r.finishedAt?.toISOString() ?? null,
  slow: isActive(r) && now.getTime() - (r.startedAt ?? r.createdAt).getTime() > SLOW_AFTER_MS,
});

/** POST /v1/agent/runs — "Run now". 409 `agent_busy` while a run is queued or running. */
export async function startRun(deps: AgentDeps, userId: string): Promise<AgentRun> {
  const busy = () => new AppError('agent_busy', 'The agent is busy with a run.');
  if (await deps.runs.findActive(userId)) throw busy();
  const run = await deps.runs.createQueued(userId, 'manual');
  if (!run) throw busy();
  try {
    await deps.agentJobs.enqueueAgentRun(run.id);
  } catch (error) {
    deps.log.error('agent.run enqueue failed', { runId: run.id, error: String(error) });
    await deps.runs.markEnqueueFailed(run.id, 'Could not queue the run');
    throw error;
  }
  return toRunDto(run, clock(deps));
}

/** GET /v1/agent/status — current run (if any), last finished run, pause flag, next scheduled run. */
export async function getAgentStatus(deps: AgentDeps, userId: string): Promise<AgentStatus> {
  const now = clock(deps);
  const [current, last, meta] = await Promise.all([
    deps.runs.findActive(userId),
    deps.runs.findLastFinished(userId),
    deps.runs.getPauseAndNextRun(userId),
  ]);
  return {
    paused: meta.paused,
    currentRun: current ? toRunDto(current, now) : null,
    lastRun: last ? toRunDto(last, now) : null,
    nextRunAt: meta.paused ? null : (meta.nextRunAt?.toISOString() ?? null),
  };
}
