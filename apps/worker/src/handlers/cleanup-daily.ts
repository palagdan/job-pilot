import type { Db } from '@job-pilot/db/client';
import { session, verification } from '@job-pilot/db/schema/auth';
import { pushSubscription } from '@job-pilot/db/schema/notifications';
import type { JobHandler } from '@job-pilot/jobs/client';
import { lt } from 'drizzle-orm';
import type { Log } from '../log.ts';

const DAY = 86_400_000;
/** Dead push subscriptions stay a week (useful when debugging delivery), then go. */
export const DEAD_PUSH_KEEP_DAYS = 7;

/**
 * Daily housekeeping: expired sessions and verification tokens (Better Auth does not delete them itself) and
 * push subscriptions the push service reported as gone. pg-boss archives its own jobs.
 */
export const cleanupDaily =
  ({
    db,
    log,
    now = () => new Date(),
  }: {
    db: Db;
    log: Log;
    now?: () => Date;
  }): JobHandler<'cleanup.daily'> =>
  async () => {
    const at = now();
    const sessions = await db
      .delete(session)
      .where(lt(session.expiresAt, at))
      .returning({ id: session.id });
    const verifications = await db
      .delete(verification)
      .where(lt(verification.expiresAt, at))
      .returning({ id: verification.id });
    const push = await db
      .delete(pushSubscription)
      .where(lt(pushSubscription.failedAt, new Date(at.getTime() - DEAD_PUSH_KEEP_DAYS * DAY)))
      .returning({ id: pushSubscription.id });
    log.info('cleanup done', {
      sessions: sessions.length,
      verifications: verifications.length,
      pushSubscriptions: push.length,
    });
  };
