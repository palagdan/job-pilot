import type { Db } from '@job-pilot/db/client';
import { cvFile } from '@job-pilot/db/schema/cv';
import { and, eq } from 'drizzle-orm';
import type { CvFileRepository } from '../../application/ports/cv-file-repository.ts';

export const createDrizzleCvFileRepository = (db: Db): CvFileRepository => ({
  find: async (cvId, format, contentHash) => {
    const [row] = await db
      .select({
        cvId: cvFile.cvId,
        format: cvFile.format,
        contentHash: cvFile.contentHash,
        storageKey: cvFile.storageKey,
        sizeBytes: cvFile.sizeBytes,
      })
      .from(cvFile)
      .where(
        and(eq(cvFile.cvId, cvId), eq(cvFile.format, format), eq(cvFile.contentHash, contentHash)),
      )
      .limit(1);
    return row ?? null;
  },
  save: async (record) => {
    await db.insert(cvFile).values(record).onConflictDoNothing();
  },
});
