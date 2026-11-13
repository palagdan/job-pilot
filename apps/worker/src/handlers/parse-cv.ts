import type { Db } from '@job-pilot/db/client';
import { upload } from '@job-pilot/db/schema/cv';
import { profile, profileProof } from '@job-pilot/db/schema/profile';
import type { JobHandler } from '@job-pilot/jobs/client';
import type { Llm } from '@job-pilot/llm/client';
import { parseCvPrompt } from '@job-pilot/llm/prompts/parse-cv';
import { type CvContent, cvContentSchema } from '@job-pilot/shared/cv';
import { messages } from '@job-pilot/shared/limits';
import type { FileStorage } from '@job-pilot/storage/file-storage';
import { eq, sql } from 'drizzle-orm';
import { extractCvText, hasEnoughText } from '../cv/extract-text.ts';
import { profileFromCv } from '../cv/profile-from-cv.ts';
import type { Log } from '../log.ts';

export type ParseCvDeps = {
  db: Db;
  storage: FileStorage;
  llm: Pick<Llm, 'generateObject'>;
  log: Log;
};

const MAX_CV_CHARS = 30_000;

class Unreadable extends Error {}

const prefillProfile = async (
  tx: Pick<Db, 'select' | 'insert'>,
  userId: string,
  cv: CvContent,
  now: Date,
) => {
  const p = profileFromCv(cv, now);
  // Only null/empty columns are filled; existing user values win.
  const keep = (column: string) => sql.raw(`coalesce("profile"."${column}", excluded."${column}")`);
  const keepArray = (column: string) =>
    sql.raw(
      `case when cardinality("profile"."${column}") = 0 then excluded."${column}" else "profile"."${column}" end`,
    );
  const keepJson = (column: string) =>
    sql.raw(
      `case when jsonb_array_length("profile"."${column}") = 0 then excluded."${column}" else "profile"."${column}" end`,
    );

  await tx
    .insert(profile)
    .values({
      userId,
      fullName: p.fullName,
      currentTitle: p.currentTitle,
      location: p.location,
      linkedinUrl: p.linkedinUrl,
      portfolioUrl: p.portfolioUrl,
      summary: p.summary,
      skills: p.skills,
      languages: p.languages,
      experience: p.experience,
    })
    .onConflictDoUpdate({
      target: profile.userId,
      set: {
        fullName: keep('full_name'),
        currentTitle: keep('current_title'),
        location: keep('location'),
        linkedinUrl: keep('linkedin_url'),
        portfolioUrl: keep('portfolio_url'),
        summary: keep('summary'),
        experience: keep('experience'),
        skills: keepArray('skills'),
        languages: keepJson('languages'),
      },
    });

  if (p.proofs.length === 0) return;
  const existing = await tx
    .select({ id: profileProof.id })
    .from(profileProof)
    .where(eq(profileProof.userId, userId))
    .limit(1);
  if (existing.length > 0) return;
  await tx
    .insert(profileProof)
    .values(p.proofs.map((text, position) => ({ userId, text, position })));
};

export const parseCv =
  ({ db, storage, llm, log }: ParseCvDeps): JobHandler<'cv.parse'> =>
  async ({ data: { uploadId } }) => {
    const [row] = await db.select().from(upload).where(eq(upload.id, uploadId));
    if (!row || row.replacedAt || row.parseStatus === 'parsed') {
      log.info('cv.parse skipped', { uploadId, found: Boolean(row) });
      return;
    }

    const setStatus = (values: Partial<typeof upload.$inferInsert>) =>
      db.update(upload).set(values).where(eq(upload.id, uploadId));

    try {
      await setStatus({ parseStatus: 'extracting', parseError: null });
      const file = await storage.get(row.storageKey);
      if (!file) throw new Error(`File not found in storage: ${row.storageKey}`);

      let extracted: Awaited<ReturnType<typeof extractCvText>>;
      try {
        extracted = await extractCvText(file.body, row.mimeType);
      } catch (error) {
        throw new Unreadable('Text extraction failed', { cause: error });
      }
      if (!hasEnoughText(extracted.text)) throw new Unreadable('Too little text in the file');

      await setStatus({
        extractedText: extracted.text,
        pageCount: extracted.pageCount,
        parseStatus: 'parsing',
      });

      const { object } = await llm.generateObject({
        task: 'parse_cv',
        prompt: parseCvPrompt,
        userId: row.userId,
        schema: cvContentSchema,
        messages: parseCvPrompt.messages({ cvText: extracted.text.slice(0, MAX_CV_CHARS) }),
      });

      await db.transaction(async (tx) => {
        await tx
          .update(upload)
          .set({ parsedContent: object, parseStatus: 'parsed', parseError: null })
          .where(eq(upload.id, uploadId));
        await prefillProfile(tx, row.userId, object, new Date());
      });
      log.info('cv.parse done', { uploadId });
    } catch (error) {
      log.error('cv.parse failed', {
        uploadId,
        error: error instanceof Error ? error.message : String(error),
        cause:
          error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined,
      });
      await setStatus({ parseStatus: 'failed', parseError: messages.cvUnreadable });
    }
  };
