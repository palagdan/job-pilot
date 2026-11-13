import type { RunFrequency } from './enums.ts';

/**
 * When the agent runs next — shared by the api (on schedule save / onboarding complete) and the worker's scheduler
 * (after each run). Pure, no date library: wall-clock times are resolved in the user's IANA time zone with Intl,
 * so DST changes are handled (a run at 08:00 stays at 08:00 local time across the switch).
 */
export type ScheduleRule = {
  frequency: RunFrequency;
  /** Hour of day in `timezone`, 0–23. */
  runHour: number;
  /** ISO 1 = Monday … 7 = Sunday; only for weekly. */
  dayOfWeek: number | null;
  /** IANA name, e.g. "Europe/Prague". */
  timezone: string;
};

type LocalDate = { year: number; month: number; day: number };

const formatters = new Map<string, Intl.DateTimeFormat>();
const formatterFor = (timeZone: string) => {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
};

/** Wall-clock fields of `instant` in `timeZone`. */
const wallClock = (instant: Date, timeZone: string) => {
  const parts: Record<string, number> = {};
  for (const p of formatterFor(timeZone).formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return parts as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
};

/** Offset of `timeZone` from UTC at `instant`, in ms (e.g. +1 h for Prague in winter). */
const offsetAt = (instant: number, timeZone: string) => {
  const w = wallClock(new Date(instant), timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
};

/**
 * The UTC instant of a local wall-clock time. Tries the zone's offset from a day before and a day after
 * (covers any DST change in between) and keeps the candidates that really show the requested time:
 * - normal: both agree;
 * - ambiguous (fall-back overlap): two match → the first occurrence;
 * - non-existent (spring-forward gap): none match → the same clock time after the gap (+1 h).
 */
export const zonedTimeToUtc = (date: LocalDate, hour: number, timeZone: string): Date => {
  const naive = Date.UTC(date.year, date.month - 1, date.day, hour);
  const day = 24 * 60 * 60 * 1000;
  const offsetBefore = offsetAt(naive - day, timeZone);
  const offsetAfter = offsetAt(naive + day, timeZone);
  const matches = [naive - offsetBefore, naive - offsetAfter].filter((t) => {
    const w = wallClock(new Date(t), timeZone);
    return w.year === date.year && w.month === date.month && w.day === date.day && w.hour === hour;
  });
  if (matches.length > 0) return new Date(Math.min(...matches));
  return new Date(naive - offsetBefore);
};

const addDays = (d: LocalDate, days: number): LocalDate => {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + days));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
};

/** ISO weekday (1 = Monday) of a calendar date. */
const isoWeekday = (d: LocalDate) =>
  ((new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay() + 6) % 7) + 1;

/** First run strictly after `after` that matches the rule (daily: any day; weekly: `dayOfWeek`). */
const nextMatching = (
  rule: ScheduleRule,
  after: Date,
  dayMatches: (d: LocalDate) => boolean,
): Date => {
  const today = wallClock(after, rule.timezone);
  let date: LocalDate = { year: today.year, month: today.month, day: today.day };
  for (let i = 0; i < 9; i++) {
    if (dayMatches(date)) {
      const candidate = zonedTimeToUtc(date, rule.runHour, rule.timezone);
      if (candidate.getTime() > after.getTime()) return candidate;
    }
    date = addDays(date, 1);
  }
  throw new Error('nextRunAt: no matching day found'); // unreachable for valid rules
};

/**
 * Next run after `now`.
 * - daily: next `runHour` today or tomorrow;
 * - weekly: next `dayOfWeek` at `runHour`;
 * - every 3 days: 3 local days after the last run (at `runHour`); before the first run, like daily.
 *   If that moment has already passed (agent paused, server down), the next daily slot.
 */
export const nextRunAt = (rule: ScheduleRule, now: Date, lastRunAt: Date | null = null): Date => {
  if (rule.frequency === 'weekly') {
    const day = rule.dayOfWeek ?? 1;
    return nextMatching(rule, now, (d) => isoWeekday(d) === day);
  }
  if (rule.frequency === 'every_3_days' && lastRunAt) {
    const last = wallClock(lastRunAt, rule.timezone);
    const target = zonedTimeToUtc(
      addDays({ year: last.year, month: last.month, day: last.day }, 3),
      rule.runHour,
      rule.timezone,
    );
    if (target.getTime() > now.getTime()) return target;
  }
  return nextMatching(rule, now, () => true);
};
