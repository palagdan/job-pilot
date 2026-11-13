import type { LanguageLevel } from '@job-pilot/shared/enums';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps, timestamptz } from '../columns.ts';
import { user } from './auth.ts';
import {
  experienceBandEnum,
  noticePeriodEnum,
  runFrequencyEnum,
  salaryPeriodEnum,
  workFormatEnum,
} from './enums.ts';

/** "Everything JobPilot believes about you". One row per user; nullable until confirmed (onboarding 2). */
export const profile = pgTable(
  'profile',
  {
    userId: uuid()
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    fullName: text(),
    currentTitle: text(),
    experience: experienceBandEnum(),
    location: text(),
    linkedinUrl: text(),
    portfolioUrl: text(),
    skills: text().array().notNull().default(sql`'{}'`),
    /** Short professional summary, from the CV parse. */
    summary: text(),
    salaryMin: integer(),
    salaryMax: integer(),
    /** ISO 4217 */
    salaryCurrency: text(),
    salaryPeriod: salaryPeriodEnum(),
    noticePeriod: noticePeriodEnum(),
    languages: jsonb().$type<{ language: string; level: LanguageLevel }[]>().notNull().default([]),
    confirmedAt: timestamptz(),
    ...timestamps(),
  },
  (t) => [
    check(
      'profile_salary_range',
      sql`${t.salaryMax} is null or ${t.salaryMin} is null or ${t.salaryMax} >= ${t.salaryMin}`,
    ),
  ],
);

/** "Projects and proof" list. */
export const profileProof = pgTable(
  'profile_proof',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    text: text().notNull(),
    position: smallint().notNull(),
    ...timestamps(),
  },
  (t) => [index().on(t.userId, t.position)],
);

export const targets = pgTable(
  'targets',
  {
    userId: uuid()
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    roles: text().array().notNull().default(sql`'{}'`),
    locations: text().array().notNull().default(sql`'{}'`),
    workFormats: workFormatEnum().array().notNull().default(sql`'{remote,hybrid}'`),
    /** Free-text exclusions interpreted by the agent: "No agencies", "adtech", company names. */
    exclusions: text().array().notNull().default(sql`'{}'`),
    findJobs: boolean().notNull().default(true),
    findEvents: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [check('targets_find_any', sql`${t.findJobs} or ${t.findEvents}`)],
);

/** Schedule and notifications. Time zone lives on `user.timezone`. */
export const schedule = pgTable(
  'schedule',
  {
    userId: uuid()
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    frequency: runFrequencyEnum().notNull().default('daily'),
    /** Hour of day in the user's time zone. */
    runHour: smallint().notNull().default(8),
    /** ISO 1 = Monday ... 7 = Sunday; only for weekly. */
    dayOfWeek: smallint(),
    notifyEmail: boolean().notNull().default(true),
    notifyPush: boolean().notNull().default(false),
    /** Computed in UTC from frequency/hour/day/time zone; the scheduler picks rows with next_run_at <= now(). */
    nextRunAt: timestamptz(),
    lastRunAt: timestamptz(),
    ...timestamps(),
  },
  (t) => [
    check('schedule_run_hour', sql`${t.runHour} between 0 and 23`),
    check(
      'schedule_day_of_week',
      sql`(${t.frequency} = 'weekly') = (${t.dayOfWeek} is not null) and (${t.dayOfWeek} is null or ${t.dayOfWeek} between 1 and 7)`,
    ),
    index().on(t.nextRunAt),
  ],
);
