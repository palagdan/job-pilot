import type { ScheduleInput } from '@job-pilot/shared/schedule';

export type ScheduleRecord = Omit<ScheduleInput, 'timezone'> & {
  nextRunAt: Date | null;
  lastRunAt: Date | null;
};

export interface ScheduleRepository {
  /** Null when not saved yet. The time zone lives on the user. */
  get(userId: string): Promise<ScheduleRecord | null>;
  /** Saves the schedule and the user's time zone in one transaction. */
  save(userId: string, input: ScheduleInput, nextRunAt: Date): Promise<ScheduleRecord>;
  setNextRunAt(userId: string, nextRunAt: Date): Promise<void>;
}
