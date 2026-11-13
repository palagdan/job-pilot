import { describe, expect, it } from 'vitest';
import { toSourceRunStatus } from './run-status.ts';

describe('toSourceRunStatus', () => {
  it.each([
    ['SUCCEEDED', 'succeeded'],
    ['FAILED', 'failed'],
    ['TIMED-OUT', 'timed_out'],
    ['ABORTED', 'aborted'],
    ['READY', 'running'],
    ['RUNNING', 'running'],
    ['TIMING-OUT', 'running'],
    ['ABORTING', 'running'],
  ])('%s -> %s', (input, expected) => {
    expect(toSourceRunStatus(input)).toBe(expected);
  });
});
