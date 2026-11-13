import type { Targets } from '@job-pilot/shared/targets';

export interface TargetsRepository {
  get(userId: string): Promise<Targets | null>;
  save(userId: string, targets: Targets): Promise<Targets>;
}
