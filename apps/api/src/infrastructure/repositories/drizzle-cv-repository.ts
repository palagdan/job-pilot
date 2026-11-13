import type { Db } from '@job-pilot/db/client';
import { user } from '@job-pilot/db/schema/auth';
import { cv, cvFile } from '@job-pilot/db/schema/cv';
import { opportunity } from '@job-pilot/db/schema/opportunities';
import { pipelineItem } from '@job-pilot/db/schema/pipeline';
import { profile } from '@job-pilot/db/schema/profile';
import { eventListing, jobPosting } from '@job-pilot/db/schema/sources';
import { ownedBy } from '@job-pilot/db/scoping';
import { and, desc, eq, max, ne } from 'drizzle-orm';
import type { CvRecord, CvRepository } from '../../application/ports/cv-repository.ts';

const select = (db: Db) =>
  db
    .select({
      cv,
      fullName: profile.fullName,
      accountName: user.name,
      jobCompany: jobPosting.company,
      jobTitle: jobPosting.title,
      eventTitle: eventListing.title,
      eventOrganizer: eventListing.organizer,
    })
    .from(cv)
    .innerJoin(user, eq(user.id, cv.userId))
    .leftJoin(profile, eq(profile.userId, cv.userId))
    .leftJoin(pipelineItem, eq(pipelineItem.id, cv.pipelineItemId))
    .leftJoin(opportunity, eq(opportunity.id, pipelineItem.opportunityId))
    .leftJoin(jobPosting, eq(jobPosting.id, opportunity.jobPostingId))
    .leftJoin(eventListing, eq(eventListing.id, opportunity.eventListingId));

type Row = Awaited<ReturnType<ReturnType<typeof select>['execute']>>[number];

const toRecord = (r: Row): CvRecord => ({
  id: r.cv.id,
  userId: r.cv.userId,
  kind: r.cv.kind,
  origin: r.cv.origin,
  version: r.cv.version,
  status: r.cv.status,
  content: r.cv.content,
  changes: r.cv.changes,
  basedOnCvId: r.cv.basedOnCvId,
  uploadId: r.cv.uploadId,
  pipelineItemId: r.cv.pipelineItemId,
  pageCount: r.cv.pageCount,
  error: r.cv.error,
  confirmedAt: r.cv.confirmedAt,
  sentAt: r.cv.sentAt,
  supersededAt: r.cv.supersededAt,
  createdAt: r.cv.createdAt,
  updatedAt: r.cv.updatedAt,
  naming: {
    fullName: r.fullName ?? r.accountName,
    company: r.jobCompany ?? r.eventOrganizer,
    role: r.jobTitle ?? r.eventTitle,
  },
});

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const supersedeOtherMasters = (tx: Tx, userId: string, keepId: string, at: Date) =>
  tx
    .update(cv)
    .set({ supersededAt: at })
    .where(and(ownedBy(cv, userId, eq(cv.kind, 'master'), ne(cv.id, keepId))));

export const createDrizzleCvRepository = (db: Db): CvRepository => ({
  listForUser: async (userId) =>
    (await select(db).where(eq(cv.userId, userId)).orderBy(desc(cv.createdAt))).map(toRecord),

  findOwned: async (id, userId) => {
    const [row] = await select(db)
      .where(ownedBy(cv, userId, eq(cv.id, id)))
      .limit(1);
    return row ? toRecord(row) : null;
  },

  confirmMaster: (id, userId, at) =>
    db.transaction(async (tx) => {
      await tx
        .update(cv)
        .set({ status: 'confirmed', confirmedAt: at, supersededAt: null })
        .where(ownedBy(cv, userId, eq(cv.id, id)));
      await supersedeOtherMasters(tx, userId, id, at);
    }),

  createMasterFromOriginal: ({ userId, uploadId, content, at }) =>
    db.transaction(async (tx) => {
      const [latest] = await tx
        .select({ version: max(cv.version) })
        .from(cv)
        .where(ownedBy(cv, userId, eq(cv.kind, 'master')));
      const [row] = await tx
        .insert(cv)
        .values({
          userId,
          kind: 'master',
          origin: 'original',
          version: Number(latest?.version ?? 0) + 1,
          status: 'confirmed',
          content,
          changes: [],
          uploadId,
          confirmedAt: at,
        })
        .returning({ id: cv.id });
      if (!row) throw new Error('master insert returned no row');
      await supersedeOtherMasters(tx, userId, row.id, at);
      return row.id;
    }),

  updateContent: async (id, content) => {
    await db.update(cv).set({ content, pageCount: null }).where(eq(cv.id, id));
  },

  setPageCount: async (id, pageCount) => {
    await db.update(cv).set({ pageCount }).where(eq(cv.id, id));
  },

  delete: (id) =>
    db.transaction(async (tx) => {
      const files = await tx
        .select({ key: cvFile.storageKey })
        .from(cvFile)
        .where(eq(cvFile.cvId, id));
      await tx.delete(cv).where(eq(cv.id, id));
      return files.map((f) => f.key);
    }),
});
