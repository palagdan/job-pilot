import type { Ops } from '@job-pilot/shared/ops';

/** Aggregates for the ops view (read-only, across all users). */
export interface OpsReader {
  summary(since: Date, now: Date): Promise<Omit<Ops, 'windowDays' | 'generatedAt'>>;
}
