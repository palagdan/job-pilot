import type { Db } from '@job-pilot/db/client';
import { cv } from '@job-pilot/db/schema/cv';
import { opportunity } from '@job-pilot/db/schema/opportunities';
import { draft, pipelineItem } from '@job-pilot/db/schema/pipeline';
import { profile, profileProof, targets } from '@job-pilot/db/schema/profile';
import { eventListing, jobPosting } from '@job-pilot/db/schema/sources';
import type { JobHandler, JobQueue } from '@job-pilot/jobs/client';
import type { Llm } from '@job-pilot/llm/client';
import { writeCoverPrompt } from '@job-pilot/llm/prompts/write-cover';
import {
  writeEventPrepPrompt,
  writeEventPrepSchema,
} from '@job-pilot/llm/prompts/write-event-prep';
import {
  writeSpecialCvPrompt,
  writeSpecialCvSchema,
} from '@job-pilot/llm/prompts/write-special-cv';
import { writeWhyCompanyPrompt } from '@job-pilot/llm/prompts/write-why-company';
import { messages } from '@job-pilot/shared/limits';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { profileText, targetsText } from '../agent/rank.ts';
import type { Log } from '../log.ts';
import {
  formatNoticePeriod,
  formatSalary,
  formLabels,
  packLang,
  postingLanguage,
} from '../pack/format.ts';

export type PreparePackDeps = {
  db: Db;
  llm: Pick<Llm, 'generateObject' | 'generateText'>;
  log: Log;
  /** For `push.pack-ready` once the pack is ready (Artem). Optional so tests can leave it out. */
  queue?: Pick<JobQueue, 'send'>;
};

type DraftRow = typeof draft.$inferInsert;

const describeError = (error: unknown) => ({
  error: error instanceof Error ? error.message : String(error),
  cause: error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined,
});

/**
 * Writes the application pack for a `preparing` pipeline item: Direct → special CV + cover text + form answers,
 * Event → registration steps + prep notes. Re-running replaces the previous pack ("Try again"). A failure marks
 * the item `failed` (E06) and is not rethrown: the user decides between "Skip for now" and "Try again".
 */
export const preparePack =
  ({ db, llm, log, queue }: PreparePackDeps): JobHandler<'pack.prepare'> =>
  async ({ data: { pipelineItemId } }) => {
    const [item] = await db.select().from(pipelineItem).where(eq(pipelineItem.id, pipelineItemId));
    if (!item) {
      log.info('pack.prepare skipped: item missing', { pipelineItemId });
      return;
    }
    if (item.status !== 'preparing') {
      log.info('pack.prepare skipped: not preparing', { pipelineItemId, status: item.status });
      return;
    }
    const { userId } = item;
    const startedAt = Date.now();

    try {
      const [opp] = await db
        .select()
        .from(opportunity)
        .where(eq(opportunity.id, item.opportunityId));
      if (!opp) throw new Error('Opportunity missing');
      const [prof] = await db.select().from(profile).where(eq(profile.userId, userId));
      if (!prof) throw new Error('Profile missing');
      const [target] = await db.select().from(targets).where(eq(targets.userId, userId));
      const proofs = await db
        .select({ text: profileProof.text })
        .from(profileProof)
        .where(eq(profileProof.userId, userId))
        .orderBy(asc(profileProof.position));

      const profileSummary = profileText({ ...prof, proofs: proofs.map((p) => p.text) });
      const targetSummary = targetsText({
        roles: target?.roles ?? [],
        locations: target?.locations ?? [],
        workFormats: target?.workFormats ?? [],
        exclusions: target?.exclusions ?? [],
      });

      let special: {
        content: typeof cv.$inferInsert.content;
        changes: string[];
        basedOnCvId: string;
      } | null = null;
      let drafts: DraftRow[];

      if (opp.type === 'event' && opp.eventListingId) {
        const [event] = await db
          .select()
          .from(eventListing)
          .where(eq(eventListing.id, opp.eventListingId));
        if (!event) throw new Error('Event missing');
        const { object } = await llm.generateObject({
          task: 'write_drafts',
          prompt: writeEventPrepPrompt,
          userId,
          schema: writeEventPrepSchema,
          messages: writeEventPrepPrompt.messages({
            profile: profileSummary,
            targets: targetSummary,
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
        drafts = [
          {
            kind: 'event_prep',
            label: 'Registration steps',
            body: object.registrationSteps.map((s) => `- ${s}`).join('\n'),
            position: 0,
          },
          { kind: 'event_prep', label: 'Prep notes', body: object.prepNotes.trim(), position: 1 },
        ].map((d) => ({ ...d, pipelineItemId }) as DraftRow);
      } else if (opp.type === 'job' && opp.jobPostingId) {
        const [job] = await db.select().from(jobPosting).where(eq(jobPosting.id, opp.jobPostingId));
        if (!job) throw new Error('Job missing');
        const masters = await db
          .select()
          .from(cv)
          .where(
            and(
              eq(cv.userId, userId),
              eq(cv.kind, 'master'),
              inArray(cv.status, ['confirmed', 'needs_review']),
            ),
          )
          .orderBy(desc(cv.version));
        const master =
          masters.find((m) => m.status === 'confirmed' && !m.supersededAt && m.content) ??
          masters.find((m) => m.status === 'needs_review' && m.content);
        if (!master?.content) throw new Error('No master CV to build from');

        const description = job.description ?? '';
        const language = postingLanguage(job.language, description);
        const lang = packLang(language);
        const jobInput = { title: job.title, company: job.company, description };

        const [cvResult, cover, why] = await Promise.all([
          llm.generateObject({
            task: 'write_cv',
            prompt: writeSpecialCvPrompt,
            userId,
            schema: writeSpecialCvSchema,
            messages: writeSpecialCvPrompt.messages({
              master: master.content,
              job: jobInput,
              targetRoles: target?.roles ?? [],
            }),
          }),
          llm.generateText({
            task: 'write_drafts',
            prompt: writeCoverPrompt,
            userId,
            messages: writeCoverPrompt.messages({
              profile: profileSummary,
              job: jobInput,
              language,
            }),
          }),
          llm.generateText({
            task: 'write_drafts',
            prompt: writeWhyCompanyPrompt,
            userId,
            messages: writeWhyCompanyPrompt.messages({
              profile: profileSummary,
              job: jobInput,
              language,
            }),
          }),
        ]);
        special = {
          content: cvResult.object.cv,
          changes: cvResult.object.changes,
          basedOnCvId: master.id,
        };
        drafts = [
          { kind: 'cover_text', label: null, body: cover.text.trim() },
          { kind: 'form_answer', label: formLabels.why, body: why.text.trim() },
          { kind: 'form_answer', label: formLabels.salary, body: formatSalary(prof, lang) },
          {
            kind: 'form_answer',
            label: formLabels.notice,
            body: formatNoticePeriod(prof.noticePeriod, lang),
          },
        ].map((d, position) => ({ ...d, position, pipelineItemId }) as DraftRow);
      } else {
        throw new Error('Opportunity has no target');
      }

      const now = new Date();
      await db.transaction(async (tx) => {
        await tx.delete(draft).where(eq(draft.pipelineItemId, pipelineItemId));
        await tx
          .delete(cv)
          .where(and(eq(cv.pipelineItemId, pipelineItemId), eq(cv.kind, 'special')));
        if (special) {
          await tx.insert(cv).values({
            userId,
            kind: 'special',
            origin: 'generated',
            status: 'ready_to_send',
            content: special.content,
            changes: special.changes,
            basedOnCvId: special.basedOnCvId,
            pipelineItemId,
          });
        }
        await tx.insert(draft).values(drafts);
        await tx
          .update(pipelineItem)
          .set({ status: 'ready_to_send', statusChangedAt: now, failureReason: null })
          .where(eq(pipelineItem.id, pipelineItemId));
      });
      log.info('pack.prepare done', { pipelineItemId, ms: Date.now() - startedAt });
      // Push "ready to send" (Artem). A failed enqueue must not mark the finished pack as failed.
      await queue
        ?.send('push.pack-ready', { pipelineItemId })
        .catch((error: unknown) =>
          log.warn('push.pack-ready enqueue failed', { pipelineItemId, error: String(error) }),
        );
    } catch (error) {
      log.error('pack.prepare failed', { pipelineItemId, ...describeError(error) });
      await db
        .update(pipelineItem)
        .set({ status: 'failed', statusChangedAt: new Date(), failureReason: messages.packFailed })
        .where(eq(pipelineItem.id, pipelineItemId));
    }
  };
