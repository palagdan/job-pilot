import { z } from 'zod';
import { dateTimeSchema } from './common.ts';
import { daysOfWeek, runFrequencies, runHours } from './enums.ts';

const isValidTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const scheduleInputSchema = z
  .object({
    frequency: z.enum(runFrequencies),
    runHour: z.literal(runHours),
    /** Only for `weekly`; must be null otherwise. */
    dayOfWeek: z.literal(daysOfWeek).nullable(),
    /** IANA name, e.g. "Europe/Prague". Stored on the user. */
    timezone: z.string().refine(isValidTimeZone, 'No time zone found'),
    notifyEmail: z.boolean(),
    notifyPush: z.boolean(),
  })
  .refine((s) => (s.frequency === 'weekly') === (s.dayOfWeek !== null), {
    path: ['dayOfWeek'],
    message: 'Pick a day for weekly runs.',
  });
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

export const scheduleDefaults = {
  frequency: 'daily',
  runHour: 8,
  dayOfWeek: null,
  notifyEmail: true,
  notifyPush: false,
} as const satisfies Omit<ScheduleInput, 'timezone'>;

export const scheduleSchema = scheduleInputSchema.and(
  z.object({
    nextRunAt: dateTimeSchema.nullable(),
    lastRunAt: dateTimeSchema.nullable(),
  }),
);
export type Schedule = z.infer<typeof scheduleSchema>;
