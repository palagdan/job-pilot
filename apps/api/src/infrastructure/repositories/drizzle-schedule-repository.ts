import type { Db } from '@job-pilot/db/client';
import { user } from '@job-pilot/db/schema/auth';
import { schedule } from '@job-pilot/db/schema/profile';
import type { DayOfWeek, RunHour } from '@job-pilot/shared/enums';
import { eq } from 'drizzle-orm';
import type {
  ScheduleRecord,
  ScheduleRepository,
} from '../../application/ports/schedule-repository.ts';

const toRecord = (r: typeof schedule.$inferSelect): ScheduleRecord => ({
  frequency: r.frequency,
  runHour: r.runHour as RunHour,
  dayOfWeek: r.dayOfWeek as DayOfWeek | null,
  notifyEmail: r.notifyEmail,
  notifyPush: r.notifyPush,
  nextRunAt: r.nextRunAt,
  lastRunAt: r.lastRunAt,
});

export const createDrizzleScheduleRepository = (db: Db): ScheduleRepository => ({
  get: async (userId) => {
    const [row] = await db.select().from(schedule).where(eq(schedule.userId, userId));
    return row ? toRecord(row) : null;
  },
  save: (userId, { timezone, ...input }, nextRunAt) =>
    db.transaction(async (tx) => {
      await tx.update(user).set({ timezone }).where(eq(user.id, userId));
      const values = { ...input, nextRunAt };
      const [row] = await tx
        .insert(schedule)
        .values({ userId, ...values })
        .onConflictDoUpdate({ target: schedule.userId, set: values })
        .returning();
      if (!row) throw new Error('schedule upsert returned no row');
      return toRecord(row);
    }),
  setNextRunAt: async (userId, nextRunAt) => {
    await db.update(schedule).set({ nextRunAt }).where(eq(schedule.userId, userId));
  },
});
