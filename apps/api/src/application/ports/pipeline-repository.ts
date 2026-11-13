import type { PipelineStatus } from '@job-pilot/shared/enums';

export interface PipelineRepository {
  /** Number of the user's pipeline items per status. */
  countByStatus(userId: string): Promise<Partial<Record<PipelineStatus, number>>>;
}
