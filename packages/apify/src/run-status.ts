import type { SourceRunStatus } from '@job-pilot/shared/enums';

const terminal: Record<string, SourceRunStatus> = {
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  'TIMED-OUT': 'timed_out',
  ABORTED: 'aborted',
};

/** READY, RUNNING, TIMING-OUT, ABORTING (and anything unknown) count as still running. */
export const toSourceRunStatus = (apifyStatus: string): SourceRunStatus =>
  terminal[apifyStatus] ?? 'running';
