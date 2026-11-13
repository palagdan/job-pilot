import { describe, expect, it } from 'vitest';
import { nextRunAt, type ScheduleRule, zonedTimeToUtc } from './next-run.ts';

const prague = (rule: Partial<ScheduleRule> = {}): ScheduleRule => ({
  frequency: 'daily',
  runHour: 8,
  dayOfWeek: null,
  timezone: 'Europe/Prague',
  ...rule,
});
const at = (iso: string) => new Date(iso);
const iso = (d: Date) => d.toISOString();

describe('zonedTimeToUtc', () => {
  it('converts Prague wall time in winter (UTC+1) and summer (UTC+2)', () => {
    expect(iso(zonedTimeToUtc({ year: 2026, month: 1, day: 15 }, 8, 'Europe/Prague'))).toBe(
      '2026-01-15T07:00:00.000Z',
    );
    expect(iso(zonedTimeToUtc({ year: 2026, month: 7, day: 15 }, 8, 'Europe/Prague'))).toBe(
      '2026-07-15T06:00:00.000Z',
    );
  });

  it('resolves a non-existent time (spring-forward gap, 02:00 → 03:00) to after the gap', () => {
    // 2026-03-29 02:00 does not exist in Prague; result shows 03:00 CEST = 01:00Z.
    expect(iso(zonedTimeToUtc({ year: 2026, month: 3, day: 29 }, 2, 'Europe/Prague'))).toBe(
      '2026-03-29T01:00:00.000Z',
    );
  });

  it('resolves an ambiguous time (fall-back overlap) to the first occurrence', () => {
    // 2026-10-25 02:00 happens twice in Prague: first at 00:00Z (CEST), then 01:00Z (CET).
    expect(iso(zonedTimeToUtc({ year: 2026, month: 10, day: 25 }, 2, 'Europe/Prague'))).toBe(
      '2026-10-25T00:00:00.000Z',
    );
  });

  it('works for zones west of UTC and with half-hour offsets', () => {
    expect(iso(zonedTimeToUtc({ year: 2026, month: 11, day: 13 }, 8, 'America/New_York'))).toBe(
      '2026-11-13T13:00:00.000Z',
    );
    expect(iso(zonedTimeToUtc({ year: 2026, month: 11, day: 13 }, 8, 'Asia/Kolkata'))).toBe(
      '2026-11-13T02:30:00.000Z',
    );
  });
});

describe('nextRunAt — daily', () => {
  it('later today when the hour has not passed, otherwise tomorrow', () => {
    expect(iso(nextRunAt(prague(), at('2026-11-13T05:00:00Z')))).toBe('2026-11-13T07:00:00.000Z');
    expect(iso(nextRunAt(prague(), at('2026-11-13T07:00:00Z')))).toBe('2026-11-14T07:00:00.000Z'); // exactly at → next
    expect(iso(nextRunAt(prague(), at('2026-11-13T09:00:00Z')))).toBe('2026-11-14T07:00:00.000Z');
  });

  it('keeps 08:00 local across the spring DST switch (29 Mar 2026)', () => {
    // Sat 28 Mar 09:00 CET → Sun 29 Mar 08:00 CEST = 06:00Z (not 07:00Z).
    expect(iso(nextRunAt(prague(), at('2026-03-28T08:00:00Z')))).toBe('2026-03-29T06:00:00.000Z');
  });

  it('keeps 08:00 local across the autumn DST switch (25 Oct 2026)', () => {
    expect(iso(nextRunAt(prague(), at('2026-10-24T08:00:00Z')))).toBe('2026-10-25T07:00:00.000Z');
  });

  it('uses the local date, not the UTC date (late evening in New York)', () => {
    // 13 Nov 23:30 New York = 14 Nov 04:30Z; next 08:00 New York is 14 Nov 13:00Z.
    const ny = prague({ timezone: 'America/New_York' });
    expect(iso(nextRunAt(ny, at('2026-11-14T04:30:00Z')))).toBe('2026-11-14T13:00:00.000Z');
  });
});

describe('nextRunAt — weekly', () => {
  it('next given weekday at the run hour', () => {
    // Fri 13 Nov 2026; weekly Monday 08:00 → Mon 16 Nov 07:00Z.
    expect(
      iso(nextRunAt(prague({ frequency: 'weekly', dayOfWeek: 1 }), at('2026-11-13T10:00:00Z'))),
    ).toBe('2026-11-16T07:00:00.000Z');
  });

  it('today if it is the day and the hour has not passed; next week if it has', () => {
    const fri = prague({ frequency: 'weekly', dayOfWeek: 5, runHour: 18 });
    expect(iso(nextRunAt(fri, at('2026-11-13T10:00:00Z')))).toBe('2026-11-13T17:00:00.000Z');
    expect(iso(nextRunAt(fri, at('2026-11-13T18:00:00Z')))).toBe('2026-11-20T17:00:00.000Z');
  });
});

describe('nextRunAt — every 3 days', () => {
  const rule = prague({ frequency: 'every_3_days' });

  it('before the first run behaves like daily', () => {
    expect(iso(nextRunAt(rule, at('2026-11-13T09:00:00Z')))).toBe('2026-11-14T07:00:00.000Z');
  });

  it('3 local days after the last run', () => {
    expect(iso(nextRunAt(rule, at('2026-11-14T07:05:00Z'), at('2026-11-14T07:00:00Z')))).toBe(
      '2026-11-17T07:00:00.000Z',
    );
  });

  it('falls back to the next daily slot when that moment has passed', () => {
    expect(iso(nextRunAt(rule, at('2026-11-20T09:00:00Z'), at('2026-11-14T07:00:00Z')))).toBe(
      '2026-11-21T07:00:00.000Z',
    );
  });
});
