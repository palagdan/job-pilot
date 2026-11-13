import type { RunStatus, RunStepKey, RunStepStatus, RunTrigger } from '@job-pilot/shared/enums';

export type AgentRunRecord = {
  id: string;
  trigger: RunTrigger;
  status: RunStatus;
  steps: { key: RunStepKey; status: RunStepStatus }[];
  newCount: number;
  startedAt: Date | null;
  finishedAt: Date | null;
};

/** Agent state for one user: pause flag on the user, runs from `agent_run`. Runs themselves are the worker's (Daniil). */
export interface AgentRepository {
  /** The queued/running run, if any (at most one per user). */
  currentRun(userId: string): Promise<AgentRunRecord | null>;
  /** The newest finished run (succeeded, failed or cancelled). */
  lastRun(userId: string): Promise<AgentRunRecord | null>;
  setPaused(userId: string, pausedAt: Date | null): Promise<void>;
}
