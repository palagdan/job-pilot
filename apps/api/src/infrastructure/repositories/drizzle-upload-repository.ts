import type { Db } from '@job-pilot/db/client';
import { upload } from '@job-pilot/db/schema/cv';
import { ownedBy } from '@job-pilot/db/scoping';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import type { UploadRecord, UploadRepository } from '../../application/ports/upload-repository.ts';

const columns = {
  id: upload.id,
  userId: upload.userId,
  storageKey: upload.storageKey,
  filename: upload.filename,
  mimeType: upload.mimeType,
  sizeBytes: upload.sizeBytes,
  pageCount: upload.pageCount,
  parseStatus: upload.parseStatus,
  parseError: upload.parseError,
  replacedAt: upload.replacedAt,
  createdAt: upload.createdAt,
};

export const createDrizzleUploadRepository = (db: Db): UploadRepository => ({
  findCurrentCv: async (userId) => {
    const [row] = await db
      .select(columns)
      .from(upload)
      .where(ownedBy(upload, userId, eq(upload.kind, 'cv_original'), isNull(upload.replacedAt)))
      .orderBy(desc(upload.createdAt))
      .limit(1);
    return row ?? null;
  },

  findOwned: async (id, userId) => {
    const [row] = await db
      .select(columns)
      .from(upload)
      .where(ownedBy(upload, userId, eq(upload.id, id)))
      .limit(1);
    return row ?? null;
  },

  create: (input, { replacePrevious }) =>
    db.transaction(async (tx) => {
      if (replacePrevious) {
        await tx
          .update(upload)
          .set({ replacedAt: new Date() })
          .where(
            and(
              ownedBy(
                upload,
                input.userId,
                eq(upload.kind, 'cv_original'),
                isNull(upload.replacedAt),
              ),
              ne(upload.id, input.id),
            ),
          );
      }
      const [row] = await tx
        .insert(upload)
        .values({ ...input, kind: 'cv_original', parseStatus: 'pending' })
        .returning(columns);
      if (!row) throw new Error('upload insert returned no row');
      return row satisfies UploadRecord;
    }),
});
