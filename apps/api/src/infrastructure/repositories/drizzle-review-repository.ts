import type { Db } from '@job-pilot/db/client';
import { activity } from '@job-pilot/db/schema/activity';
import { cv } from '@job-pilot/db/schema/cv';
import { opportunity } from '@job-pilot/db/schema/opportunities';
import { draft, followUp, pipelineItem } from '@job-pilot/db/schema/pipeline';
import { eventListing, jobPosting, source } from '@job-pilot/db/schema/sources';
import { ownedBy } from '@job-pilot/db/scoping';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type {
  DraftRecord,
  ReviewItemRecord,
  ReviewRepository,
} from '../../application/ports/review-repository.ts';
import { pipelineSelect, toPipelineRecord } from './drizzle-today-repository.ts';

const jobSource = alias(source, 'job_source');
const eventSource = alias(source, 'event_source');

/** Extras the base pipeline row does not carry: posting url/source, event details, special CV id. */
const detailSelect = (db: Db) =>
  db
    .select({
      id: pipelineItem.id,
      jobUrl: jobPosting.url,
      jobLocation: jobPosting.locationRaw,
      jobCity: jobPosting.city,
      jobExpiredAt: jobPosting.expiredAt,
      jobSource: jobSource.name,
      eventUrl: eventListing.url,
      eventSource: eventSource.name,
      eventEndsAt: eventListing.endsAt,
      eventCity: eventListing.city,
      eventOnline: eventListing.online,
      eventVenue: eventListing.venue,
      eventDescription: eventListing.description,
      eventCancelledAt: eventListing.cancelledAt,
      specialCvId: sql<
        string | null
      >`(select ${cv.id} from ${cv} where ${cv.pipelineItemId} = ${pipelineItem.id} and ${cv.kind} = 'special' limit 1)`,
    })
    .from(pipelineItem)
    .innerJoin(opportunity, eq(opportunity.id, pipelineItem.opportunityId))
    .leftJoin(jobPosting, eq(jobPosting.id, opportunity.jobPostingId))
    .leftJoin(eventListing, eq(eventListing.id, opportunity.eventListingId))
    .leftJoin(jobSource, eq(jobSource.id, jobPosting.sourceId))
    .leftJoin(eventSource, eq(eventSource.id, eventListing.sourceId));

const toDraft = (r: typeof draft.$inferSelect): DraftRecord => ({
  id: r.id,
  pipelineItemId: r.pipelineItemId,
  kind: r.kind,
  label: r.label,
  body: r.body,
  charLimit: r.charLimit,
  version: r.version,
  editedByUserAt: r.editedByUserAt,
  updatedAt: r.updatedAt,
});

export const createDrizzleReviewRepository = (db: Db): ReviewRepository => {
  const hydrate = async (
    userId: string,
    records: ReturnType<typeof toPipelineRecord>[],
  ): Promise<ReviewItemRecord[]> => {
    if (records.length === 0) return [];
    const extras = await detailSelect(db).where(
      ownedBy(
        pipelineItem,
        userId,
        sql`${pipelineItem.id} in (${sql.join(
          records.map((r) => sql`${r.id}`),
          sql`, `,
        )})`,
      ),
    );
    const byId = new Map(extras.map((e) => [e.id, e]));
    return records.flatMap((r) => {
      const e = byId.get(r.id);
      if (!e) return [];
      const isEvent = r.type === 'event';
      return [
        {
          ...r,
          specialCvId: e.specialCvId,
          url: (isEvent ? e.eventUrl : e.jobUrl) ?? '',
          sourceName: (isEvent ? e.eventSource : e.jobSource) ?? '',
          location: isEvent ? e.eventCity : (e.jobLocation ?? e.jobCity),
          postingUnavailable: isEvent ? e.eventCancelledAt !== null : e.jobExpiredAt !== null,
          event:
            isEvent && r.eventStartsAt
              ? {
                  organizer: r.company,
                  startsAt: r.eventStartsAt,
                  endsAt: e.eventEndsAt,
                  city: e.eventCity,
                  online: e.eventOnline ?? false,
                  venue: e.eventVenue,
                  description: e.eventDescription,
                }
              : null,
        },
      ];
    });
  };

  return {
    listWaiting: async (userId) => {
      const rows = await pipelineSelect(db)
        .where(ownedBy(pipelineItem, userId, eq(pipelineItem.status, 'ready_to_send')))
        .orderBy(desc(pipelineItem.statusChangedAt), desc(pipelineItem.id));
      return hydrate(userId, rows.map(toPipelineRecord));
    },

    find: async (userId, id) => {
      const [row] = await pipelineSelect(db).where(
        ownedBy(pipelineItem, userId, eq(pipelineItem.id, id)),
      );
      if (!row) return null;
      return (await hydrate(userId, [toPipelineRecord(row)]))[0] ?? null;
    },

    listDrafts: async (userId, itemId) => {
      const rows = await db
        .select({ d: draft })
        .from(draft)
        .innerJoin(pipelineItem, eq(pipelineItem.id, draft.pipelineItemId))
        .where(ownedBy(pipelineItem, userId, eq(draft.pipelineItemId, itemId)))
        .orderBy(asc(draft.position), asc(draft.createdAt));
      return rows.map((r) => toDraft(r.d));
    },

    findDraft: async (userId, id) => {
      const [row] = await db
        .select({ d: draft })
        .from(draft)
        .innerJoin(pipelineItem, eq(pipelineItem.id, draft.pipelineItemId))
        .where(ownedBy(pipelineItem, userId, eq(draft.id, id)));
      return row ? toDraft(row.d) : null;
    },

    updateDraft: ({ userId, id, body, version, now }) =>
      db.transaction(async (tx) => {
        const [owned] = await tx
          .select({ id: draft.id, pipelineItemId: draft.pipelineItemId })
          .from(draft)
          .innerJoin(pipelineItem, eq(pipelineItem.id, draft.pipelineItemId))
          .where(ownedBy(pipelineItem, userId, eq(draft.id, id)));
        if (!owned) return null;
        const [row] = await tx
          .update(draft)
          .set({
            body,
            version: version + 1,
            editedByUserAt: now,
            updatedAt: now,
          })
          .where(and(eq(draft.id, id), eq(draft.version, version)))
          .returning();
        if (!row) return null;
        await tx.insert(activity).values({
          userId,
          actor: 'user',
          entity: 'draft',
          entityId: id,
          action: 'draft.edit',
          after: { version: row.version },
        });
        return toDraft(row);
      }),

    listFollowUps: async (userId, itemId) => {
      const rows = await db
        .select({ f: followUp })
        .from(followUp)
        .innerJoin(pipelineItem, eq(pipelineItem.id, followUp.pipelineItemId))
        .where(ownedBy(pipelineItem, userId, eq(followUp.pipelineItemId, itemId)))
        .orderBy(asc(followUp.sequence));
      return rows.map(({ f }) => ({
        id: f.id,
        sequence: f.sequence,
        dueAt: f.dueAt,
        status: f.status,
        completedAt: f.completedAt,
        draftId: f.draftId,
      }));
    },

    completeFollowUp: ({ userId, id, now, nextDueAt, undoableUntil }) =>
      db.transaction(async (tx) => {
        const [current] = await tx
          .select({ f: followUp, item: pipelineItem })
          .from(followUp)
          .innerJoin(pipelineItem, eq(pipelineItem.id, followUp.pipelineItemId))
          .where(ownedBy(pipelineItem, userId, eq(followUp.id, id)))
          .for('update');
        if (!current) return { ok: false, reason: 'not_found' } as const;
        const { f, item } = current;
        if (f.status !== 'pending' || item.status !== 'sent') {
          return { ok: false, reason: 'wrong_state' } as const;
        }
        await tx
          .update(followUp)
          .set({ status: 'done', completedAt: now, updatedAt: now })
          .where(eq(followUp.id, id));
        let nextId: string | null = null;
        if (f.sequence === 1) {
          const [next] = await tx
            .insert(followUp)
            .values({ pipelineItemId: item.id, sequence: 2, dueAt: nextDueAt })
            .returning({ id: followUp.id });
          nextId = next?.id ?? null;
        }
        const nextFollowUpAt = nextId ? nextDueAt : null;
        await tx
          .update(pipelineItem)
          .set({ nextFollowUpAt, updatedAt: now })
          .where(eq(pipelineItem.id, item.id));
        const [act] = await tx
          .insert(activity)
          .values({
            userId,
            actor: 'user',
            entity: 'follow_up',
            entityId: id,
            action: 'follow_up.complete',
            before: { nextFollowUpAt: item.nextFollowUpAt?.toISOString() ?? null },
            after: { nextFollowUpId: nextId, sequence: f.sequence },
            undoableUntil,
          })
          .returning({ id: activity.id });
        if (!act) throw new Error('activity insert returned no row');
        return { ok: true, activityId: act.id, nextFollowUpAt } as const;
      }),

    markDone: ({ userId, id, kind, now, followUpDueAt, undoableUntil }) =>
      db.transaction(async (tx) => {
        const [current] = await tx
          .select({ item: pipelineItem, type: opportunity.type })
          .from(pipelineItem)
          .innerJoin(opportunity, eq(opportunity.id, pipelineItem.opportunityId))
          .where(ownedBy(pipelineItem, userId, eq(pipelineItem.id, id)))
          .for('update', { of: pipelineItem });
        if (!current) return { ok: false, reason: 'not_found' } as const;
        const item = current.item;
        const rightType = kind === 'sent' ? current.type === 'job' : current.type === 'event';
        if (item.status !== 'ready_to_send' || !rightType) {
          return { ok: false, reason: 'wrong_state' } as const;
        }

        let followUpId: string | null = null;
        if (followUpDueAt) {
          const [fu] = await tx
            .insert(followUp)
            .values({ pipelineItemId: id, sequence: 1, dueAt: followUpDueAt })
            .returning({ id: followUp.id });
          followUpId = fu?.id ?? null;
        }
        await tx
          .update(pipelineItem)
          .set({
            status: kind,
            statusChangedAt: now,
            ...(kind === 'sent' ? { sentAt: now } : { registeredAt: now }),
            nextFollowUpAt: followUpDueAt,
            updatedAt: now,
          })
          .where(eq(pipelineItem.id, id));
        const [act] = await tx
          .insert(activity)
          .values({
            userId,
            actor: 'user',
            entity: 'pipeline_item',
            entityId: id,
            action: kind === 'sent' ? 'pipeline.mark_sent' : 'pipeline.mark_registered',
            before: {
              status: item.status,
              statusChangedAt: item.statusChangedAt.toISOString(),
              sentAt: item.sentAt?.toISOString() ?? null,
              registeredAt: item.registeredAt?.toISOString() ?? null,
              nextFollowUpAt: item.nextFollowUpAt?.toISOString() ?? null,
            },
            after: { status: kind, followUpId },
            undoableUntil,
          })
          .returning({ id: activity.id });
        if (!act) throw new Error('activity insert returned no row');
        return { ok: true, activityId: act.id, nextFollowUpAt: followUpDueAt } as const;
      }),

    markNotSent: (userId, id, now) =>
      db.transaction(async (tx) => {
        const [item] = await tx
          .select()
          .from(pipelineItem)
          .where(ownedBy(pipelineItem, userId, eq(pipelineItem.id, id)))
          .for('update');
        if (!item) return { ok: false, reason: 'not_found' } as const;
        if (item.status !== 'sent' && item.status !== 'registered') {
          return { ok: false, reason: 'wrong_state' } as const;
        }
        await tx
          .update(followUp)
          .set({ status: 'cancelled', updatedAt: now })
          .where(and(eq(followUp.pipelineItemId, id), eq(followUp.status, 'pending')));
        await tx
          .update(pipelineItem)
          .set({
            status: 'ready_to_send',
            statusChangedAt: now,
            sentAt: null,
            registeredAt: null,
            nextFollowUpAt: null,
            updatedAt: now,
          })
          .where(eq(pipelineItem.id, id));
        await tx.insert(activity).values({
          userId,
          actor: 'user',
          entity: 'pipeline_item',
          entityId: id,
          action: 'pipeline.mark_not_sent',
          before: { status: item.status },
          after: { status: 'ready_to_send' },
        });
        return { ok: true } as const;
      }),
  };
};
