/** Pause flag on the user (C07). Runs and status live in `AgentRunRepository` (Daniil). */
export interface AgentRepository {
  setPaused(userId: string, pausedAt: Date | null): Promise<void>;
}
