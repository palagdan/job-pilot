import type { Db } from '@job-pilot/db/client';
import { activity } from '@job-pilot/db/schema/activity';
import { cv } from '@job-pilot/db/schema/cv';
import { opportunity } from '@job-pilot/db/schema/opportunities';
import { followUp, note, pipelineItem } from '@job-pilot/db/schema/pipeline';
import { eventListing, jobPosting } from '@job-pilot/db/schema/sources';
import { ownedBy } from '@job-pilot/db/scoping';
import { pipelineStatuses } from '@job-pilot/shared/enums';
import { and, asc, count, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import type {
  PipelineItemRecord,
  PipelineListQuery,
  PipelineRepository,
} from '../../application/ports/pipeline-repository.ts';

const company = sql<string | null>`coalesce(${jobPosting.company}, ${eventListing.organizer})`;
const title = sql<string>`coalesce(${jobPosting.title}, ${eventListing.title}, '')`;

const select = (db: Db) =>
  db
    .select({
      item: pipelineItem,
      type: opportunity.type,
      title,
      company,
      eventStartsAt: eventListing.startsAt,
      specialCvId: cv.id,
      notesCount: sql<number>`(select count(*)::int from ${note} where ${note.pipelineItemId} = ${pipelineItem.id})`,
    })
    .from(pipelineItem)
    .innerJoin(opportunity, eq(opportunity.id, pipelineItem.opportunityId))
    .leftJoin(jobPosting, eq(jobPosting.id, opportunity.jobPostingId))
    .leftJoin(eventListing, eq(eventListing.id, opportunity.eventListingId))
    .leftJoin(cv, and(eq(cv.pipelineItemId, pipelineItem.id), eq(cv.kind, 'special')));

type Row = Awaited<ReturnType<ReturnType<typeof select>['execute']>>[number];

type FollowUpRef = PipelineItemRecord['followUp'];

const toRecord = (r: Row, followUps: Map<string, FollowUpRef>): PipelineItemRecord => ({
  id: r.item.id,
  opportunityId: r.item.opportunityId,
  type: r.type,
  title: r.title,
  company: r.company,
  route: r.item.route,
  status: r.item.status,
  statusChangedAt: r.item.statusChangedAt,
  sentAt: r.item.sentAt,
  registeredAt: r.item.registeredAt,
  interviewAt: r.item.interviewAt,
  eventStartsAt: r.eventStartsAt,
  nextFollowUpAt: r.item.nextFollowUpAt,
  specialCvId: r.specialCvId,
  followUp: followUps.get(r.item.id) ?? null,
  notesCount: r.notesCount,
  createdAt: r.item.createdAt,
});

/** Workflow order of statuses (Preparing → … → Failed), for "Sort: status". */
const statusRank = sql`array_position(array[${sql.join(
  pipelineStatuses.map((s) => sql`${s}`),
  sql`, `,
)}]::text[], ${pipelineItem.status}::text)`;

/** When the next thing happens: follow-up due, interview, or the event itself. */
const nextActionAt = sql`coalesce(
  ${pipelineItem.nextFollowUpAt},
  case when ${pipelineItem.status} = 'interview' then ${pipelineItem.interviewAt} end,
  case when ${pipelineItem.status} = 'registered' then ${eventListing.startsAt} end
)`;

const orderBy = (sort: PipelineListQuery['sort']): SQL[] => {
  const newest = [desc(pipelineItem.createdAt), asc(pipelineItem.id)];
  switch (sort) {
    case 'newest':
      return newest;
    case 'status':
      return [asc(statusRank), ...newest];
    case 'company':
      return [sql`lower(coalesce(${company}, ${title})) asc`, ...newest];
    default:
      return [sql`${nextActionAt} asc nulls last`, ...newest];
  }
};

/** The earliest pending follow-up per item. */
const pendingFollowUps = async (db: Db, itemIds: string[]) => {
  if (itemIds.length === 0) return new Map<string, FollowUpRef>();
  const rows = await db
    .selectDistinctOn([followUp.pipelineItemId], {
      id: followUp.id,
      itemId: followUp.pipelineItemId,
      sequence: followUp.sequence,
      dueAt: followUp.dueAt,
    })
    .from(followUp)
    .where(and(inArray(followUp.pipelineItemId, itemIds), eq(followUp.status, 'pending')))
    .orderBy(followUp.pipelineItemId, asc(followUp.dueAt));
  return new Map<string, FollowUpRef>(
    rows.map((r) => [r.itemId, { id: r.id, sequence: r.sequence, dueAt: r.dueAt }]),
  );
};

const withFollowUps = async (db: Db, rows: Row[]) => {
  const followUps = await pendingFollowUps(
    db,
    rows.map((r) => r.item.id),
  );
  return rows.map((r) => toRecord(r, followUps));
};

export const createDrizzlePipelineRepository = (db: Db): PipelineRepository => ({
  countByStatus: async (userId) => {
    const rows = await db
      .select({ status: pipelineItem.status, n: count() })
      .from(pipelineItem)
      .where(eq(pipelineItem.userId, userId))
      .groupBy(pipelineItem.status);
    return Object.fromEntries(rows.map((r) => [r.status, r.n]));
  },

  list: async (userId, q) => {
    const rows = await select(db)
      .where(
        ownedBy(
          pipelineItem,
          userId,
          q.statuses ? inArray(pipelineItem.status, [...q.statuses]) : undefined,
          q.type ? eq(opportunity.type, q.type) : undefined,
        ),
      )
      .orderBy(...orderBy(q.sort))
      .limit(q.limit)
      .offset(q.offset);
    return withFollowUps(db, rows);
  },

  find: async (userId, id) => {
    const [row] = await select(db).where(ownedBy(pipelineItem, userId, eq(pipelineItem.id, id)));
    return row ? ((await withFollowUps(db, [row]))[0] ?? null) : null;
  },

  transition: (userId, id, change) =>
    db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(pipelineItem)
        .where(
          ownedBy(
            pipelineItem,
            userId,
            eq(pipelineItem.id, id),
            inArray(pipelineItem.status, [...change.from]),
          ),
        )
        .for('update');
      if (!current) return false;

      const { status, interviewAt, route } = change.set;
      await tx
        .update(pipelineItem)
        .set({
          status,
          ...(status !== current.status && { statusChangedAt: change.now }),
          ...(interviewAt !== undefined && { interviewAt }),
          ...(route !== undefined && { route }),
          ...(change.cancelFollowUps && { nextFollowUpAt: null }),
        })
        .where(eq(pipelineItem.id, id));
      // The Today card shows the route too; keep both in step.
      if (route !== undefined) {
        await tx
          .update(opportunity)
          .set({ route })
          .where(eq(opportunity.id, current.opportunityId));
      }
      if (change.cancelFollowUps) {
        await tx
          .update(followUp)
          .set({ status: 'cancelled' })
          .where(and(eq(followUp.pipelineItemId, id), eq(followUp.status, 'pending')));
      }
      await tx.insert(activity).values({
        userId,
        actor: 'user',
        entity: 'pipeline_item',
        entityId: id,
        action: change.action,
        before: {
          status: current.status,
          route: current.route,
          interviewAt: current.interviewAt?.toISOString() ?? null,
          nextFollowUpAt: current.nextFollowUpAt?.toISOString() ?? null,
        },
        after: {
          status,
          route: route ?? current.route,
          interviewAt:
            (interviewAt === undefined ? current.interviewAt : interviewAt)?.toISOString() ?? null,
        },
      });
      return true;
    }),

  listNotes: async (pipelineItemId) =>
    db
      .select({ id: note.id, body: note.body, createdAt: note.createdAt })
      .from(note)
      .where(eq(note.pipelineItemId, pipelineItemId))
      .orderBy(desc(note.createdAt), desc(note.id)),

  addNote: async (pipelineItemId, body) => {
    const [row] = await db
      .insert(note)
      .values({ pipelineItemId, body })
      .returning({ id: note.id, body: note.body, createdAt: note.createdAt });
    if (!row) throw new Error('note insert returned no row');
    return row;
  },
});
