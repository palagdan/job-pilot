import type { CvContent } from '@job-pilot/shared/cv';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps, timestamptz } from '../columns.ts';
import { user } from './auth.ts';
import {
  cvKindEnum,
  cvOriginEnum,
  cvStatusEnum,
  fileFormatEnum,
  parseStatusEnum,
  uploadKindEnum,
} from './enums.ts';
import { pipelineItem } from './pipeline.ts';

/** Uploaded files (original CV, kept unchanged). */
export const upload = pgTable(
  'upload',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: uploadKindEnum().notNull().default('cv_original'),
    storageKey: text().notNull(),
    filename: text().notNull(),
    mimeType: text().notNull(),
    sizeBytes: integer().notNull(),
    pageCount: smallint(),
    parseStatus: parseStatusEnum().notNull().default('pending'),
    parseError: text(),
    extractedText: text(),
    /** LLM parse result (structured CV) — pre-fills the profile and is the base for "Keep my original". */
    parsedContent: jsonb().$type<CvContent>(),
    /** Replaced by a newer upload (C04). */
    replacedAt: timestamptz(),
    ...timestamps(),
  },
  (t) => [index().on(t.userId, t.createdAt)],
);

/** Master CV versions and special CVs (one per pipeline item). */
export const cv = pgTable(
  'cv',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: cvKindEnum().notNull(),
    origin: cvOriginEnum().notNull().default('generated'),
    /** Master: 1, 2, ... per user. Special: bumps on regenerate/edit. */
    version: smallint().notNull().default(1),
    status: cvStatusEnum().notNull().default('generating'),
    /** Null while generating. */
    content: jsonb().$type<CvContent>(),
    /** "What changed" / "Changed: headline, 4 bullets, keyword order". */
    changes: text().array().notNull().default(sql`'{}'`),
    basedOnCvId: uuid().references((): AnyPgColumn => cv.id, { onDelete: 'set null' }),
    uploadId: uuid().references(() => upload.id, { onDelete: 'set null' }),
    pipelineItemId: uuid().references(() => pipelineItem.id, { onDelete: 'cascade' }),
    pageCount: smallint(),
    error: text(),
    confirmedAt: timestamptz(),
    sentAt: timestamptz(),
    /** Old master versions after a replace. */
    supersededAt: timestamptz(),
    ...timestamps(),
  },
  (t) => [
    check(
      'cv_kind_link',
      sql`(${t.kind} = 'master' and ${t.pipelineItemId} is null) or (${t.kind} = 'special' and ${t.pipelineItemId} is not null)`,
    ),
    uniqueIndex('cv_master_version').on(t.userId, t.version).where(sql`${t.kind} = 'master'`),
    uniqueIndex('cv_special_per_item').on(t.pipelineItemId).where(sql`${t.kind} = 'special'`),
    index().on(t.userId, t.kind),
  ],
);

/** Rendered PDF/DOCX cache. Invalidated when `contentHash` no longer matches the CV content. */
export const cvFile = pgTable(
  'cv_file',
  {
    id: id(),
    cvId: uuid()
      .notNull()
      .references(() => cv.id, { onDelete: 'cascade' }),
    format: fileFormatEnum().notNull(),
    contentHash: text().notNull(),
    storageKey: text().notNull(),
    sizeBytes: integer().notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex().on(t.cvId, t.format, t.contentHash)],
);
