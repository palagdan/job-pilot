import type { Db } from '@job-pilot/db/client';
import { user } from '@job-pilot/db/schema/auth';
import { cv, upload } from '@job-pilot/db/schema/cv';
import { profile, profileProof, schedule, targets } from '@job-pilot/db/schema/profile';
import type { JobHandler, JobQueue } from '@job-pilot/jobs/client';
import type { Llm } from '@job-pilot/llm/client';
import { writeMasterCvPrompt, writeMasterCvSchema } from '@job-pilot/llm/prompts/write-master-cv';
import { messages } from '@job-pilot/shared/limits';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { Log } from '../log.ts';

export type GenerateMasterCvDeps = {
  db: Db;
  llm: Pick<Llm, 'generateObject'>;
  queue: Pick<JobQueue, 'send'>;
  log: Log;
};

const isUniqueViolation = (error: unknown): boolean => {
  const code = (e: unknown) => (e as { code?: string } | null)?.code;
  return code(error) === '23505' || code((error as { cause?: unknown } | null)?.cause) === '23505';
};

const describeError = (error: unknown) => ({
  error: error instanceof Error ? error.message : String(error),
  cause: error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined,
});

/**
 * Writes the master CV from the parsed upload, the confirmed profile and the targets. A master row still in
 * `generating` is reused (retry); otherwise a new version is created (first run or regenerate). A failure marks
 * the row `failed` and is not rethrown: the user decides between "Try again" and "Keep my original".
 */
export const generateMasterCv =
  ({ db, llm, queue, log }: GenerateMasterCvDeps): JobHandler<'cv.generate-master'> =>
  async ({ data: { userId, uploadId } }) => {
    const [owner] = await db.select().from(user).where(eq(user.id, userId));
    if (!owner) {
      log.info('cv.generate-master skipped: user missing', { userId });
      return;
    }

    const [source] = await db
      .select()
      .from(upload)
      .where(
        uploadId
          ? and(eq(upload.id, uploadId), eq(upload.userId, userId))
          : and(
              eq(upload.userId, userId),
              eq(upload.parseStatus, 'parsed'),
              isNull(upload.replacedAt),
            ),
      )
      .orderBy(desc(upload.createdAt))
      .limit(1);
    const [prof] = await db.select().from(profile).where(eq(profile.userId, userId));
    if (!source?.parsedContent || !prof) {
      log.info('cv.generate-master skipped: nothing to work from', {
        userId,
        parsedUpload: Boolean(source?.parsedContent),
        profile: Boolean(prof),
      });
      return;
    }

    const proofs = await db
      .select({ text: profileProof.text })
      .from(profileProof)
      .where(eq(profileProof.userId, userId))
      .orderBy(asc(profileProof.position));
    const [target] = await db.select().from(targets).where(eq(targets.userId, userId));
    const [sched] = await db.select().from(schedule).where(eq(schedule.userId, userId));

    const claim = async (): Promise<string> => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const masters = await db
          .select({ id: cv.id, version: cv.version, status: cv.status })
          .from(cv)
          .where(and(eq(cv.userId, userId), eq(cv.kind, 'master')))
          .orderBy(desc(cv.version));
        const generating = masters.find((m) => m.status === 'generating');
        if (generating) return generating.id;
        try {
          const [row] = await db
            .insert(cv)
            .values({
              userId,
              kind: 'master',
              origin: 'generated',
              version: (masters[0]?.version ?? 0) + 1,
              status: 'generating',
              uploadId: source.id,
            })
            .returning({ id: cv.id });
          if (row) return row.id;
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
        }
      }
      throw new Error('Could not create the master CV row');
    };

    const cvId = await claim();

    try {
      const { object } = await llm.generateObject({
        task: 'write_cv',
        prompt: writeMasterCvPrompt,
        userId,
        schema: writeMasterCvSchema,
        messages: writeMasterCvPrompt.messages({
          original: source.parsedContent,
          profile: {
            fullName: prof.fullName,
            currentTitle: prof.currentTitle,
            experience: prof.experience,
            location: prof.location,
            linkedinUrl: prof.linkedinUrl,
            portfolioUrl: prof.portfolioUrl,
            summary: prof.summary,
            skills: prof.skills,
            languages: prof.languages,
          },
          proofs: proofs.map((p) => p.text),
          targets: {
            roles: target?.roles ?? [],
            locations: target?.locations ?? [],
            workFormats: target?.workFormats ?? [],
          },
        }),
      });
      await db
        .update(cv)
        .set({ content: object.cv, changes: object.changes, status: 'needs_review', error: null })
        .where(eq(cv.id, cvId));
      log.info('cv.generate-master done', { userId, cvId });
    } catch (error) {
      log.error('cv.generate-master failed', { userId, cvId, ...describeError(error) });
      await db
        .update(cv)
        .set({ status: 'failed', error: messages.masterCvFailed })
        .where(eq(cv.id, cvId));
      return;
    }

    if (!owner.onboardingCompletedAt || !target || !sched) return;
    await queue.send('email.send', {
      template: 'agent_live',
      userId,
      dedupeKey: `agent_live:${userId}`,
      data: {
        firstName: owner.name.trim().split(/\s+/)[0] || 'there',
        roles: target.roles,
        locations: target.locations,
        workFormats: target.workFormats,
        findJobs: target.findJobs,
        findEvents: target.findEvents,
        frequency: sched.frequency,
        runHour: sched.runHour,
        dayOfWeek: sched.dayOfWeek,
        timezone: owner.timezone,
        notifyEmail: sched.notifyEmail,
        notifyPush: sched.notifyPush,
      },
    });
  };
