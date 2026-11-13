import type { Db } from '@job-pilot/db/client';
import { activity } from '@job-pilot/db/schema/activity';
import { opportunity } from '@job-pilot/db/schema/opportunities';
import { followUp, note, pipelineItem } from '@job-pilot/db/schema/pipeline';
import { targets } from '@job-pilot/db/schema/profile';
import { eventListing, jobPosting, source } from '@job-pilot/db/schema/sources';
import { ownedBy } from '@job-pilot/db/scoping';
import { limits } from '@job-pilot/shared/limits';
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type {
  OpportunityRecord,
  PipelineItemRecord,
  TodayRepository,
  UndoOutcome,
} from '../../application/ports/today-repository.ts';

const jobSource = alias(source, 'job_source');
const eventSource = alias(source, 'event_source');

const feedSelect = (db: Db) =>
  db
    .select({
      opp: opportunity,
      job: jobPosting,
      event: eventListing,
      jobSource: jobSource.name,
      eventSource: eventSource.name,
      pipelineItemId: pipelineItem.id,
    })
    .from(opportunity)
    .leftJoin(jobPosting, eq(jobPosting.id, opportunity.jobPostingId))
    .leftJoin(eventListing, eq(eventListing.id, opportunity.eventListingId))
    .leftJoin(jobSource, eq(jobSource.id, jobPosting.sourceId))
    .leftJoin(eventSource, eq(eventSource.id, eventListing.sourceId))
    .leftJoin(pipelineItem, eq(pipelineItem.opportunityId, opportunity.id));

type FeedRow = Awaited<ReturnType<ReturnType<typeof feedSelect>['execute']>>[number];

const toRecord = (r: FeedRow): OpportunityRecord | null => {
  const base = {
    id: r.opp.id,
    feedStatus: r.opp.feedStatus,
    fitScore: r.opp.fitScore,
    why: r.opp.why,
    gapNote: r.opp.gapNote,
    route: r.opp.route,
    routeReason: r.opp.routeReason,
    pipelineItemId: r.pipelineItemId,
    createdAt: r.opp.createdAt,
  };
  if (r.opp.type === 'job' && r.job) {
    return {
      ...base,
      type: 'job',
      url: r.job.url,
      sourceName: r.jobSource ?? '',
      job: {
        title: r.job.title,
        company: r.job.company,
        location: r.job.locationRaw ?? r.job.city,
        workFormats: r.job.workFormats,
        postedAt: r.job.postedAt,
        expiredAt: r.job.expiredAt,
      },
    };
  }
  if (r.opp.type === 'event' && r.event) {
    return {
      ...base,
      type: 'event',
      url: r.event.url,
      sourceName: r.eventSource ?? '',
      event: {
        title: r.event.title,
        organizer: r.event.organizer,
        startsAt: r.event.startsAt,
        endsAt: r.event.endsAt,
        city: r.event.city,
        online: r.event.online,
        cancelledAt: r.event.cancelledAt,
      },
    };
  }
  return null;
};

export const pipelineSelect = (db: Db) =>
  db
    .select({
      item: pipelineItem,
      type: opportunity.type,
      jobTitle: jobPosting.title,
      jobCompany: jobPosting.company,
      eventTitle: eventListing.title,
      eventOrganizer: eventListing.organizer,
      eventStartsAt: eventListing.startsAt,
      notesCount: sql<number>`(select count(*)::int from ${note} where ${note.pipelineItemId} = ${pipelineItem.id})`,
    })
    .from(pipelineItem)
    .innerJoin(opportunity, eq(opportunity.id, pipelineItem.opportunityId))
    .leftJoin(jobPosting, eq(jobPosting.id, opportunity.jobPostingId))
    .leftJoin(eventListing, eq(eventListing.id, opportunity.eventListingId));

type PipelineRow = Awaited<ReturnType<ReturnType<typeof pipelineSelect>['execute']>>[number];

export const toPipelineRecord = (r: PipelineRow): PipelineItemRecord => ({
  id: r.item.id,
  opportunityId: r.item.opportunityId,
  type: r.type,
  title: r.jobTitle ?? r.eventTitle ?? '',
  company: r.jobCompany ?? r.eventOrganizer,
  route: r.item.route,
  status: r.item.status,
  statusChangedAt: r.item.statusChangedAt,
  sentAt: r.item.sentAt,
  registeredAt: r.item.registeredAt,
  interviewAt: r.item.interviewAt,
  eventStartsAt: r.eventStartsAt,
  nextFollowUpAt: r.item.nextFollowUpAt,
  notesCount: r.notesCount,
  createdAt: r.item.createdAt,
});

type SkipSnapshot = {
  feedStatus: 'new' | 'expired';
  skipReason: string | null;
  skipNote: string | null;
  feedStatusChangedAt: string | null;
};

type PipelineSnapshot = {
  status: string;
  statusChangedAt: string;
  sentAt: string | null;
  registeredAt: string | null;
  nextFollowUpAt: string | null;
};

export const createDrizzleTodayRepository = (db: Db): TodayRepository => ({
  listFeed: async (userId, minFit) => {
    const rows = await feedSelect(db)
      .where(
        ownedBy(
          opportunity,
          userId,
          inArray(opportunity.feedStatus, ['new', 'expired']),
          gte(opportunity.fitScore, minFit),
        ),
      )
      .orderBy(desc(opportunity.fitScore), desc(opportunity.createdAt));
    return rows.map(toRecord).filter((r): r is OpportunityRecord => r !== null);
  },

  findOwned: async (userId, id) => {
    const [row] = await feedSelect(db).where(ownedBy(opportunity, userId, eq(opportunity.id, id)));
    return row ? toRecord(row) : null;
  },

  readyToSendCount: async (userId) => {
    const [row] = await db
      .select({ n: count() })
      .from(pipelineItem)
      .where(ownedBy(pipelineItem, userId, eq(pipelineItem.status, 'ready_to_send')));
    return row?.n ?? 0;
  },

  followUpsDue: async (userId, now) => {
    const rows = await db
      .select({ itemId: followUp.pipelineItemId })
      .from(followUp)
      .innerJoin(pipelineItem, eq(pipelineItem.id, followUp.pipelineItemId))
      .where(
        ownedBy(
          pipelineItem,
          userId,
          eq(pipelineItem.status, 'sent'),
          eq(followUp.status, 'pending'),
          lte(followUp.dueAt, now),
        ),
      )
      .orderBy(asc(followUp.dueAt));
    const items = new Set(rows.map((r) => r.itemId));
    return { count: items.size, firstPipelineItemId: rows[0]?.itemId ?? null };
  },

  eventsStartingBetween: async (userId, now, until) => {
    const rows = await db
      .select({
        pipelineItemId: pipelineItem.id,
        title: eventListing.title,
        startsAt: eventListing.startsAt,
      })
      .from(pipelineItem)
      .innerJoin(opportunity, eq(opportunity.id, pipelineItem.opportunityId))
      .innerJoin(eventListing, eq(eventListing.id, opportunity.eventListingId))
      .where(
        ownedBy(
          pipelineItem,
          userId,
          eq(pipelineItem.status, 'registered'),
          gt(eventListing.startsAt, now),
          lte(eventListing.startsAt, until),
        ),
      )
      .orderBy(asc(eventListing.startsAt));
    return rows;
  },

  setRoute: async (userId, id, route, routeReason) => {
    await db
      .update(opportunity)
      .set({ route, routeReason })
      .where(ownedBy(opportunity, userId, eq(opportunity.id, id)));
  },

  skip: ({ userId, id, reason, note: skipNote, company, now, undoableUntil }) =>
    db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(opportunity)
        .where(
          ownedBy(
            opportunity,
            userId,
            eq(opportunity.id, id),
            inArray(opportunity.feedStatus, ['new', 'expired']),
          ),
        )
        .for('update');
      if (!current || (current.feedStatus !== 'new' && current.feedStatus !== 'expired')) {
        return null;
      }

      let addedExclusion: string | null = null;
      if (reason === 'company_excluded' && company) {
        const [t] = await tx
          .select({ exclusions: targets.exclusions })
          .from(targets)
          .where(eq(targets.userId, userId))
          .for('update');
        const name = company.slice(0, limits.tag.max);
        const known = t?.exclusions.some((e) => e.toLowerCase() === name.toLowerCase());
        if (
          t &&
          !known &&
          t.exclusions.length < limits.exclusions.max &&
          name.length >= limits.tag.min
        ) {
          await tx
            .update(targets)
            .set({ exclusions: [...t.exclusions, name] })
            .where(eq(targets.userId, userId));
          addedExclusion = name;
        }
      }

      await tx
        .update(opportunity)
        .set({ feedStatus: 'skipped', skipReason: reason, skipNote, feedStatusChangedAt: now })
        .where(eq(opportunity.id, id));

      const before: SkipSnapshot = {
        feedStatus: current.feedStatus,
        skipReason: current.skipReason,
        skipNote: current.skipNote,
        feedStatusChangedAt: current.feedStatusChangedAt?.toISOString() ?? null,
      };
      const [act] = await tx
        .insert(activity)
        .values({
          userId,
          actor: 'user',
          entity: 'opportunity',
          entityId: id,
          action: 'opportunity.skip',
          before,
          after: { feedStatus: 'skipped', skipReason: reason, skipNote, addedExclusion },
          undoableUntil,
        })
        .returning({ id: activity.id });
      if (!act) throw new Error('activity insert returned no row');
      return { activityId: act.id, addedExclusion };
    }),

  dismiss: (userId, id, now) =>
    db.transaction(async (tx) => {
      const [current] = await tx
        .select({ feedStatus: opportunity.feedStatus })
        .from(opportunity)
        .where(
          ownedBy(
            opportunity,
            userId,
            eq(opportunity.id, id),
            inArray(opportunity.feedStatus, ['new', 'expired']),
          ),
        )
        .for('update');
      if (!current) return false;
      await tx
        .update(opportunity)
        .set({ feedStatus: 'dismissed', feedStatusChangedAt: now })
        .where(eq(opportunity.id, id));
      await tx.insert(activity).values({
        userId,
        actor: 'user',
        entity: 'opportunity',
        entityId: id,
        action: 'opportunity.dismiss',
        before: { feedStatus: current.feedStatus },
        after: { feedStatus: 'dismissed' },
      });
      return true;
    }),

  pursue: ({ userId, id, route, now }) =>
    db.transaction(async (tx) => {
      const [current] = await tx
        .select({ feedStatus: opportunity.feedStatus })
        .from(opportunity)
        .where(
          ownedBy(opportunity, userId, eq(opportunity.id, id), eq(opportunity.feedStatus, 'new')),
        )
        .for('update');
      if (!current) return null;
      await tx
        .update(opportunity)
        .set({ feedStatus: 'pursued', feedStatusChangedAt: now })
        .where(eq(opportunity.id, id));
      const [item] = await tx
        .insert(pipelineItem)
        .values({ userId, opportunityId: id, route, status: 'preparing', statusChangedAt: now })
        .onConflictDoNothing()
        .returning({ id: pipelineItem.id });
      if (!item) return null;
      await tx.insert(activity).values({
        userId,
        actor: 'user',
        entity: 'opportunity',
        entityId: id,
        action: 'opportunity.pursue',
        before: { feedStatus: 'new' },
        after: { feedStatus: 'pursued', pipelineItemId: item.id },
      });
      return item.id;
    }),

  findPipelineItem: async (userId, id) => {
    const [row] = await pipelineSelect(db).where(
      ownedBy(pipelineItem, userId, eq(pipelineItem.id, id)),
    );
    return row ? toPipelineRecord(row) : null;
  },

  findPipelineItemByOpportunity: async (userId, opportunityId) => {
    const [row] = await pipelineSelect(db).where(
      ownedBy(pipelineItem, userId, eq(pipelineItem.opportunityId, opportunityId)),
    );
    return row ? toPipelineRecord(row) : null;
  },

  undo: (userId, token, now): Promise<UndoOutcome> =>
    db.transaction(async (tx) => {
      const [act] = await tx
        .select()
        .from(activity)
        .where(ownedBy(activity, userId, eq(activity.id, token)))
        .for('update');
      if (!act) return 'not_found';
      if (act.undoneAt) return 'already_undone';
      if (!act.undoableUntil) return 'not_undoable';
      if (act.undoableUntil.getTime() < now.getTime()) return 'expired';
      if (act.action === 'pipeline.mark_sent' || act.action === 'pipeline.mark_registered') {
        const before = act.before as PipelineSnapshot;
        const after = act.after as { status: string; followUpId: string | null };
        const [item] = await tx
          .select({ status: pipelineItem.status })
          .from(pipelineItem)
          .where(ownedBy(pipelineItem, userId, eq(pipelineItem.id, act.entityId)))
          .for('update');
        if (!item || item.status !== after.status) return 'changed';
        if (after.followUpId) {
          // The follow-up is gone (or already acted on) → the item moved on; do not undo.
          const removed = await tx
            .delete(followUp)
            .where(and(eq(followUp.id, after.followUpId), eq(followUp.status, 'pending')))
            .returning({ id: followUp.id });
          if (removed.length === 0) return 'changed';
        }
        const date = (v: string | null) => (v ? new Date(v) : null);
        await tx
          .update(pipelineItem)
          .set({
            status: before.status as never,
            statusChangedAt: new Date(before.statusChangedAt),
            sentAt: date(before.sentAt),
            registeredAt: date(before.registeredAt),
            nextFollowUpAt: date(before.nextFollowUpAt),
          })
          .where(eq(pipelineItem.id, act.entityId));
        await tx
          .update(activity)
          .set({ undoneAt: now })
          .where(and(eq(activity.id, act.id), isNull(activity.undoneAt)));
        return 'undone';
      }
      if (act.action === 'follow_up.complete') {
        const before = act.before as { nextFollowUpAt: string | null };
        const after = act.after as { nextFollowUpId: string | null };
        const [fu] = await tx
          .select({ f: followUp, item: pipelineItem })
          .from(followUp)
          .innerJoin(pipelineItem, eq(pipelineItem.id, followUp.pipelineItemId))
          .where(ownedBy(pipelineItem, userId, eq(followUp.id, act.entityId)))
          .for('update');
        if (fu?.f.status !== 'done' || fu.item.status !== 'sent') return 'changed';
        if (after.nextFollowUpId) {
          // #2 already acted on (or cancelled) → the item moved on; do not undo.
          const removed = await tx
            .delete(followUp)
            .where(and(eq(followUp.id, after.nextFollowUpId), eq(followUp.status, 'pending')))
            .returning({ id: followUp.id });
          if (removed.length === 0) return 'changed';
        }
        await tx
          .update(followUp)
          .set({ status: 'pending', completedAt: null })
          .where(eq(followUp.id, act.entityId));
        await tx
          .update(pipelineItem)
          .set({ nextFollowUpAt: before.nextFollowUpAt ? new Date(before.nextFollowUpAt) : null })
          .where(eq(pipelineItem.id, fu.item.id));
        await tx
          .update(activity)
          .set({ undoneAt: now })
          .where(and(eq(activity.id, act.id), isNull(activity.undoneAt)));
        return 'undone';
      }
      if (act.action !== 'opportunity.skip') return 'not_undoable';

      const before = act.before as SkipSnapshot;
      const after = act.after as { addedExclusion?: string | null };
      const [restored] = await tx
        .update(opportunity)
        .set({
          feedStatus: before.feedStatus,
          skipReason: before.skipReason as never,
          skipNote: before.skipNote,
          feedStatusChangedAt: before.feedStatusChangedAt
            ? new Date(before.feedStatusChangedAt)
            : null,
        })
        .where(
          ownedBy(
            opportunity,
            userId,
            eq(opportunity.id, act.entityId),
            eq(opportunity.feedStatus, 'skipped'),
          ),
        )
        .returning({ id: opportunity.id });
      if (!restored) return 'changed';

      if (after.addedExclusion) {
        const [t] = await tx
          .select({ exclusions: targets.exclusions })
          .from(targets)
          .where(eq(targets.userId, userId))
          .for('update');
        if (t) {
          await tx
            .update(targets)
            .set({ exclusions: t.exclusions.filter((e) => e !== after.addedExclusion) })
            .where(eq(targets.userId, userId));
        }
      }
      await tx
        .update(activity)
        .set({ undoneAt: now })
        .where(and(eq(activity.id, act.id), isNull(activity.undoneAt)));
      return 'undone';
    }),
});
