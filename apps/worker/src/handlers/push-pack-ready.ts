import type { Db } from '@job-pilot/db/client';
import { user } from '@job-pilot/db/schema/auth';
import { pushSubscription } from '@job-pilot/db/schema/notifications';
import { opportunity } from '@job-pilot/db/schema/opportunities';
import { pipelineItem } from '@job-pilot/db/schema/pipeline';
import { schedule } from '@job-pilot/db/schema/profile';
import { eventListing, jobPosting } from '@job-pilot/db/schema/sources';
import type { JobHandler } from '@job-pilot/jobs/client';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Log } from '../log.ts';
import type { PushSender } from '../push/push-sender.ts';

/** Shown by the service worker (`apps/web/public/sw.js`). */
export type PushMessage = { title: string; body: string; url: string; tag: string };

/**
 * "Pack ready to send" Web Push (spec: push only when a pack is ready). Skipped when push is off, the user is
 * paused, the item is no longer ready, or push is not configured (`send` undefined). Dead subscriptions (404/410)
 * are marked `failed_at`; the job fails (and retries) only when no device could be reached for another reason.
 */
export const pushPackReady =
  ({
    db,
    send,
    webUrl,
    log,
    now = () => new Date(),
  }: {
    db: Db;
    send: PushSender | undefined;
    webUrl: string;
    log: Log;
    now?: () => Date;
  }): JobHandler<'push.pack-ready'> =>
  async ({ data: { pipelineItemId } }) => {
    const skip = (reason: string) => log.info('push skipped', { pipelineItemId, reason });
    if (!send) return skip('push not configured');

    const [row] = await db
      .select({
        userId: pipelineItem.userId,
        status: pipelineItem.status,
        pausedAt: user.pausedAt,
        notifyPush: schedule.notifyPush,
        jobTitle: jobPosting.title,
        company: jobPosting.company,
        eventTitle: eventListing.title,
      })
      .from(pipelineItem)
      .innerJoin(user, eq(user.id, pipelineItem.userId))
      .innerJoin(opportunity, eq(opportunity.id, pipelineItem.opportunityId))
      .leftJoin(schedule, eq(schedule.userId, pipelineItem.userId))
      .leftJoin(jobPosting, eq(jobPosting.id, opportunity.jobPostingId))
      .leftJoin(eventListing, eq(eventListing.id, opportunity.eventListingId))
      .where(eq(pipelineItem.id, pipelineItemId));
    if (!row) return skip('item not found');
    if (row.status !== 'ready_to_send') return skip(`status ${row.status}`);
    if (row.pausedAt) return skip('paused');
    if (!row.notifyPush) return skip('push off');

    const targets = await db
      .select()
      .from(pushSubscription)
      .where(and(eq(pushSubscription.userId, row.userId), isNull(pushSubscription.failedAt)));
    if (targets.length === 0) return skip('no subscriptions');

    const what = row.jobTitle
      ? row.company
        ? `${row.jobTitle} - ${row.company}`
        : row.jobTitle
      : (row.eventTitle ?? 'Your application');
    const message: PushMessage = {
      title: 'A pack is ready to send',
      body: `${what}. Review it and send it yourself.`,
      url: `${webUrl}/review/${pipelineItemId}`,
      tag: `pack-ready:${pipelineItemId}`,
    };
    const payload = JSON.stringify(message);

    const outcomes = await Promise.all(targets.map((t) => send(t, payload)));
    const gone = targets.filter((_, i) => outcomes[i] === 'gone').map((t) => t.id);
    if (gone.length) {
      await db
        .update(pushSubscription)
        .set({ failedAt: now() })
        .where(inArray(pushSubscription.id, gone));
    }
    const sent = outcomes.filter((o) => o === 'sent').length;
    const failed = outcomes.filter((o) => o === 'failed').length;
    log.info('push sent', { pipelineItemId, sent, gone: gone.length, failed });
    // Retry only if nothing went out: a retry after a partial success would notify the same device twice.
    if (sent === 0 && failed > 0) throw new Error(`push failed on all ${failed} device(s)`);
  };
