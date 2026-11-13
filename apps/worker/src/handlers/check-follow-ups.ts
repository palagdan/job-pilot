import type { Db } from '@job-pilot/db/client';
import { activity } from '@job-pilot/db/schema/activity';
import { opportunity } from '@job-pilot/db/schema/opportunities';
import { draft, followUp, pipelineItem } from '@job-pilot/db/schema/pipeline';
import { profile, profileProof, targets } from '@job-pilot/db/schema/profile';
import { eventListing, jobPosting } from '@job-pilot/db/schema/sources';
import type { JobHandler } from '@job-pilot/jobs/client';
import type { Llm } from '@job-pilot/llm/client';
import {
  writeEventPrepPrompt,
  writeEventPrepSchema,
} from '@job-pilot/llm/prompts/write-event-prep';
import { writeFollowUpPrompt } from '@job-pilot/llm/prompts/write-follow-up';
import { and, asc, eq, gt, isNull, lte, min, sql } from 'drizzle-orm';
import { profileText, targetsText } from '../agent/rank.ts';
import type { Log } from '../log.ts';
import { postingLanguage } from '../pack/format.ts';

export type CheckFollowUpsDeps = {
  db: Db;
  llm: Pick<Llm, 'generateObject' | 'generateText'>;
  log: Log;
  now?: () => Date;
};

const DAY_MS = 86_400_000;
/** After the second follow-up was sent, this long without a status change means "no reply". */
export const NO_REPLY_AFTER_MS = 7 * DAY_MS;
/** Registered events starting within this window get their prep notes ensured. */
export const EVENT_PREP_WINDOW_MS = DAY_MS;
/** Follow-up drafts sit after the pack drafts. */
const FOLLOW_UP_POSITION = 10;

const describeError = (error: unknown) => ({
  error: error instanceof Error ? error.message : String(error),
  cause: error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined,
});

type Counters = { drafted: number; noReply: number; prepEnsured: number; failed: number };

const loadProfile = async (db: Db, userId: string) => {
  const [prof] = await db.select().from(profile).where(eq(profile.userId, userId));
  if (!prof) throw new Error('Profile missing');
  const proofs = await db
    .select({ text: profileProof.text })
    .from(profileProof)
    .where(eq(profileProof.userId, userId))
    .orderBy(asc(profileProof.position));
  return { prof, summary: profileText({ ...prof, proofs: proofs.map((p) => p.text) }) };
};

/** `pipeline_item.nextFollowUpAt` mirrors the earliest pending follow-up. */
const syncNextFollowUp = async (db: Db, pipelineItemId: string) => {
  const [row] = await db
    .select({ next: min(followUp.dueAt) })
    .from(followUp)
    .where(and(eq(followUp.pipelineItemId, pipelineItemId), eq(followUp.status, 'pending')));
  await db
    .update(pipelineItem)
    .set({ nextFollowUpAt: row?.next ?? null })
    .where(eq(pipelineItem.id, pipelineItemId));
};

/** Draft the text for one due follow-up. Returns false when someone else already did. */
const draftFollowUp = async (
  { db, llm }: CheckFollowUpsDeps,
  f: { id: string; sequence: number; pipelineItemId: string },
): Promise<boolean> => {
  const [row] = await db
    .select({ item: pipelineItem, opp: opportunity })
    .from(pipelineItem)
    .innerJoin(opportunity, eq(opportunity.id, pipelineItem.opportunityId))
    .where(eq(pipelineItem.id, f.pipelineItemId));
  if (!row?.opp.jobPostingId) throw new Error('Follow-up item has no job posting');
  const [job] = await db.select().from(jobPosting).where(eq(jobPosting.id, row.opp.jobPostingId));
  if (!job) throw new Error('Job missing');
  const { prof, summary } = await loadProfile(db, row.item.userId);

  const { text } = await llm.generateText({
    task: 'write_drafts',
    prompt: writeFollowUpPrompt,
    userId: row.item.userId,
    messages: writeFollowUpPrompt.messages({
      profile: summary,
      candidateName: prof.fullName ?? 'the candidate',
      job: { title: job.title, company: job.company },
      sequence: f.sequence === 2 ? 2 : 1,
      sentOn: (row.item.sentAt ?? row.item.statusChangedAt).toISOString().slice(0, 10),
      language: postingLanguage(job.language, job.description ?? ''),
    }),
  });

  return db.transaction(async (tx) => {
    const [fresh] = await tx
      .select({ draftId: followUp.draftId, status: followUp.status })
      .from(followUp)
      .where(eq(followUp.id, f.id))
      .for('update');
    if (!fresh || fresh.draftId || fresh.status !== 'pending') return false;
    const [created] = await tx
      .insert(draft)
      .values({
        pipelineItemId: f.pipelineItemId,
        kind: 'follow_up',
        label: `Follow-up #${f.sequence}`,
        body: text.trim(),
        position: FOLLOW_UP_POSITION + f.sequence,
      })
      .returning({ id: draft.id });
    if (!created) throw new Error('draft insert returned no row');
    await tx.update(followUp).set({ draftId: created.id }).where(eq(followUp.id, f.id));
    return true;
  });
};

/** Sent items whose second follow-up went out over 7 days ago and nothing changed → `no_reply`. */
const markNoReply = async (db: Db, now: Date, counters: Counters, log: Log) => {
  const cutoff = new Date(now.getTime() - NO_REPLY_AFTER_MS);
  const rows = await db
    .select({ itemId: pipelineItem.id, userId: pipelineItem.userId })
    .from(followUp)
    .innerJoin(pipelineItem, eq(pipelineItem.id, followUp.pipelineItemId))
    .where(
      and(
        eq(followUp.sequence, 2),
        eq(followUp.status, 'done'),
        lte(followUp.completedAt, cutoff),
        eq(pipelineItem.status, 'sent'),
      ),
    );
  for (const r of rows) {
    try {
      const changed = await db.transaction(async (tx) => {
        const [current] = await tx
          .select({ status: pipelineItem.status })
          .from(pipelineItem)
          .where(eq(pipelineItem.id, r.itemId))
          .for('update');
        if (current?.status !== 'sent') return false;
        await tx
          .update(followUp)
          .set({ status: 'cancelled' })
          .where(and(eq(followUp.pipelineItemId, r.itemId), eq(followUp.status, 'pending')));
        await tx
          .update(pipelineItem)
          .set({ status: 'no_reply', statusChangedAt: now, nextFollowUpAt: null })
          .where(eq(pipelineItem.id, r.itemId));
        await tx.insert(activity).values({
          userId: r.userId,
          actor: 'system',
          entity: 'pipeline_item',
          entityId: r.itemId,
          action: 'pipeline.no_reply',
          before: { status: 'sent' },
          after: { status: 'no_reply' },
        });
        return true;
      });
      if (changed) counters.noReply++;
    } catch (error) {
      counters.failed++;
      log.error('follow-up.check no_reply failed', {
        pipelineItemId: r.itemId,
        ...describeError(error),
      });
    }
  }
};

/** Registered events starting within 24 h need their "Prep notes" draft (normally written with the pack). */
const ensureEventPrep = async (
  { db, llm }: CheckFollowUpsDeps,
  now: Date,
  counters: Counters,
  log: Log,
) => {
  const until = new Date(now.getTime() + EVENT_PREP_WINDOW_MS);
  const rows = await db
    .select({
      itemId: pipelineItem.id,
      userId: pipelineItem.userId,
      eventId: opportunity.eventListingId,
      hasPrep: sql<boolean>`exists (select 1 from ${draft} where ${draft.pipelineItemId} = ${pipelineItem.id} and ${draft.kind} = 'event_prep' and ${draft.label} = 'Prep notes')`,
    })
    .from(pipelineItem)
    .innerJoin(opportunity, eq(opportunity.id, pipelineItem.opportunityId))
    .innerJoin(eventListing, eq(eventListing.id, opportunity.eventListingId))
    .where(
      and(
        eq(pipelineItem.status, 'registered'),
        gt(eventListing.startsAt, now),
        lte(eventListing.startsAt, until),
        isNull(eventListing.cancelledAt),
      ),
    );
  for (const r of rows) {
    if (r.hasPrep || !r.eventId) continue;
    try {
      const [event] = await db.select().from(eventListing).where(eq(eventListing.id, r.eventId));
      if (!event) throw new Error('Event missing');
      const { summary } = await loadProfile(db, r.userId);
      const [target] = await db.select().from(targets).where(eq(targets.userId, r.userId));
      const { object } = await llm.generateObject({
        task: 'write_drafts',
        prompt: writeEventPrepPrompt,
        userId: r.userId,
        schema: writeEventPrepSchema,
        messages: writeEventPrepPrompt.messages({
          profile: summary,
          targets: targetsText({
            roles: target?.roles ?? [],
            locations: target?.locations ?? [],
            workFormats: target?.workFormats ?? [],
            exclusions: target?.exclusions ?? [],
          }),
          event: {
            title: event.title,
            organizer: event.organizer,
            url: event.url,
            startsAt: event.startsAt.toISOString(),
            venue: event.venue,
            city: event.city,
            online: event.online,
            description: event.description ?? '',
          },
        }),
      });
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${r.itemId}))`);
        const [exists] = await tx
          .select({ id: draft.id })
          .from(draft)
          .where(
            and(
              eq(draft.pipelineItemId, r.itemId),
              eq(draft.kind, 'event_prep'),
              eq(draft.label, 'Prep notes'),
            ),
          );
        if (exists) return;
        await tx.insert(draft).values({
          pipelineItemId: r.itemId,
          kind: 'event_prep',
          label: 'Prep notes',
          body: object.prepNotes.trim(),
          position: 1,
        });
        counters.prepEnsured++;
      });
    } catch (error) {
      counters.failed++;
      log.error('follow-up.check event prep failed', {
        pipelineItemId: r.itemId,
        ...describeError(error),
      });
    }
  }
};

/**
 * Hourly. (1) Pending follow-ups that are due get their drafted text; (2) sent items whose second follow-up
 * is over 7 days old become `no_reply`; (3) registered events within 24 h have their prep notes ensured.
 * Idempotent; one item failing does not stop the others.
 */
export const checkFollowUps =
  (deps: CheckFollowUpsDeps): JobHandler<'follow-up.check'> =>
  async () => {
    const { db, log } = deps;
    const now = (deps.now ?? (() => new Date()))();
    const counters: Counters = { drafted: 0, noReply: 0, prepEnsured: 0, failed: 0 };

    const due = await db
      .select({
        id: followUp.id,
        sequence: followUp.sequence,
        pipelineItemId: followUp.pipelineItemId,
      })
      .from(followUp)
      .innerJoin(pipelineItem, eq(pipelineItem.id, followUp.pipelineItemId))
      .where(
        and(
          eq(followUp.status, 'pending'),
          lte(followUp.dueAt, now),
          isNull(followUp.draftId),
          eq(pipelineItem.status, 'sent'),
        ),
      )
      .orderBy(asc(followUp.dueAt))
      .limit(100);

    for (const f of due) {
      try {
        if (await draftFollowUp(deps, f)) counters.drafted++;
        await syncNextFollowUp(db, f.pipelineItemId);
      } catch (error) {
        counters.failed++;
        log.error('follow-up.check draft failed', { followUpId: f.id, ...describeError(error) });
      }
    }

    await markNoReply(db, now, counters, log);
    await ensureEventPrep(deps, now, counters, log);
    log.info('follow-up.check done', counters);
  };
