import type { RunStatus, RunStepKey, RunStepStatus, RunTrigger } from '@job-pilot/shared/enums';

export type AgentRunRecord = {
  id: string;
  trigger: RunTrigger;
  status: RunStatus;
  steps: { key: RunStepKey; status: RunStepStatus }[];
  newCount: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
};

export interface AgentRunRepository {
  /** Inserts a queued run; null when the user already has an active one (unique index). */
  createQueued(userId: string, trigger: RunTrigger): Promise<AgentRunRecord | null>;
  markEnqueueFailed(runId: string, error: string): Promise<void>;
  /** Queued or running. */
  findActive(userId: string): Promise<AgentRunRecord | null>;
  /** Newest run that has ended (succeeded / failed / cancelled). */
  findLastFinished(userId: string): Promise<AgentRunRecord | null>;
  findOwned(userId: string, id: string): Promise<AgentRunRecord | null>;
  /** Paused flag (user.pausedAt) and the schedule's next run. */
  getPauseAndNextRun(userId: string): Promise<{ paused: boolean; nextRunAt: Date | null }>;
}
