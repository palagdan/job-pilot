import type { Db } from '@job-pilot/db/client';
import { user } from '@job-pilot/db/schema/auth';
import { emailLog } from '@job-pilot/db/schema/notifications';
import { schedule } from '@job-pilot/db/schema/profile';
import type { JobHandler, JobQueue } from '@job-pilot/jobs/client';
import { and, eq, gt, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { Log } from '../log.ts';

const HOUR_MS = 60 * 60 * 1000;
export const REMINDER_AFTER_MS = 24 * HOUR_MS;
export const REMINDER_GIVE_UP_MS = 7 * 24 * HOUR_MS;
export const BATCH_LIMIT = 100;

/** Hourly: asks `email.send` for a reminder to users who signed up 24 h to 7 days ago and have not finished onboarding. */
export const finishSetupReminders =
  ({
    db,
    queue,
    log,
  }: {
    db: Db;
    queue: Pick<JobQueue, 'send'>;
    log: Log;
  }): JobHandler<'email.finish-setup-reminders'> =>
  async () => {
    const now = Date.now();
    const users = await db
      .select({ id: user.id })
      .from(user)
      .leftJoin(schedule, eq(schedule.userId, user.id))
      .where(
        and(
          lt(user.createdAt, new Date(now - REMINDER_AFTER_MS)),
          gt(user.createdAt, new Date(now - REMINDER_GIVE_UP_MS)),
          isNull(user.onboardingCompletedAt),
          isNull(user.emailUnsubscribedAt),
          or(isNull(schedule.notifyEmail), ne(schedule.notifyEmail, false)),
          sql`not exists (select 1 from ${emailLog} where ${emailLog.dedupeKey} = 'finish_setup_reminder:' || ${user.id}::text)`,
        ),
      )
      .limit(BATCH_LIMIT);

    for (const { id } of users) {
      await queue.send('email.send', {
        template: 'finish_setup_reminder',
        userId: id,
        dedupeKey: `finish_setup_reminder:${id}`,
        data: {},
      });
    }
    log.info('finish-setup reminders enqueued', { count: users.length });
  };
