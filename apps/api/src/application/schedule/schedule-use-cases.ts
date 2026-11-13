import { nextRunAt } from '@job-pilot/shared/next-run';
import { type Schedule, type ScheduleInput, scheduleDefaults } from '@job-pilot/shared/schedule';
import { assertStepReached, loadUser } from '../onboarding/onboarding-rules.ts';
import type { ScheduleRecord, ScheduleRepository } from '../ports/schedule-repository.ts';
import type { UserRepository } from '../ports/user-repository.ts';

type Deps = { schedules: ScheduleRepository; users: UserRepository; now?: () => Date };

const toDto = (r: ScheduleRecord, timezone: string): Schedule => ({
  frequency: r.frequency,
  runHour: r.runHour,
  dayOfWeek: r.dayOfWeek,
  timezone,
  notifyEmail: r.notifyEmail,
  notifyPush: r.notifyPush,
  nextRunAt: r.nextRunAt?.toISOString() ?? null,
  lastRunAt: r.lastRunAt?.toISOString() ?? null,
});

/** GET /v1/schedule — spec defaults (Daily 08:00, Email on, Push off) until saved; time zone from the user. */
export async function getSchedule(deps: Deps, userId: string): Promise<Schedule> {
  const user = await loadUser(deps.users, userId);
  const saved = await deps.schedules.get(userId);
  return toDto(saved ?? { ...scheduleDefaults, nextRunAt: null, lastRunAt: null }, user.timezone);
}

/**
 * PUT /v1/schedule — onboarding step 4 and "Profile and targets". Saves the schedule + time zone and computes the
 * next run in the user's time zone ("A change applies from the next run"). Onboarding is finished separately
 * (POST /v1/onboarding/complete).
 */
export async function putSchedule(
  deps: Deps,
  userId: string,
  input: ScheduleInput,
): Promise<Schedule> {
  const user = await loadUser(deps.users, userId);
  assertStepReached(user, 'schedule');
  const existing = await deps.schedules.get(userId);
  const next = nextRunAt(input, (deps.now ?? (() => new Date()))(), existing?.lastRunAt ?? null);
  const saved = await deps.schedules.save(userId, input, next);
  return toDto(saved, input.timezone);
}
