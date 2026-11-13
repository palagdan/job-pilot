import { z } from 'zod';
import { dateTimeSchema, idSchema, yearMonthSchema } from './common.ts';
import { cvKinds, cvOrigins, cvStatuses, fileFormats, languageLevels } from './enums.ts';

/**
 * Structured CV. The single source of truth for a CV's text: PDF/DOCX are rendered from it,
 * "Edit text" edits it, "Compare with master" diffs it.
 */
export const cvContentSchema = z.object({
  header: z.object({
    fullName: z.string(),
    headline: z.string(),
    location: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    links: z.array(z.object({ label: z.string(), url: z.string() })),
  }),
  summary: z.string(),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      location: z.string().nullable(),
      start: yearMonthSchema.nullable(),
      /** null = present */
      end: yearMonthSchema.nullable(),
      bullets: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({
      school: z.string(),
      degree: z.string().nullable(),
      field: z.string().nullable(),
      start: yearMonthSchema.nullable(),
      end: yearMonthSchema.nullable(),
    }),
  ),
  skills: z.array(z.string()),
  languages: z.array(z.object({ language: z.string(), level: z.enum(languageLevels) })),
  projects: z.array(
    z.object({ name: z.string(), description: z.string(), url: z.string().nullable() }),
  ),
});
export type CvContent = z.infer<typeof cvContentSchema>;

export const cvSummarySchema = z.object({
  id: idSchema,
  kind: z.enum(cvKinds),
  origin: z.enum(cvOrigins),
  version: z.number().int(),
  status: z.enum(cvStatuses),
  /** "User_Name_CV_JobPilot_v1.pdf" / "CV - Company - Role.pdf" (without extension). */
  fileBaseName: z.string(),
  basedOnCvId: idSchema.nullable(),
  /** Special CVs only. */
  pipelineItemId: idSchema.nullable(),
  /** "Headline rewritten for your target roles", ... */
  changes: z.array(z.string()),
  pageCount: z.number().int().nullable(),
  confirmedAt: dateTimeSchema.nullable(),
  sentAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});
export type CvSummary = z.infer<typeof cvSummarySchema>;

export const cvSchema = cvSummarySchema.extend({
  content: cvContentSchema.nullable(),
});
export type Cv = z.infer<typeof cvSchema>;

/** CVs page. */
export const cvListSchema = z.object({
  master: cvSummarySchema.nullable(),
  /** The user's uploaded file, kept unchanged. */
  original: z.object({ uploadId: idSchema, filename: z.string() }).nullable(),
  special: z.array(cvSummarySchema),
});
export type CvList = z.infer<typeof cvListSchema>;

export const editCvInputSchema = z.object({ content: cvContentSchema });

export const downloadQuerySchema = z.object({
  format: z.enum(fileFormats).default('pdf'),
});
/**
 * Short-lived download link: a signed storage URL (S3/R2), or a same-origin api path in local storage mode
 * (`/v1/files/…`, served by the api for the signed-in owner only).
 */
export const downloadSchema = z.object({
  url: z.union([
    z.url(),
    z.string().regex(/^\/v1\/files\//, 'Must be an absolute URL or a /v1/files/ path'),
  ]),
  filename: z.string(),
});

export const cvCompareSchema = z.object({
  base: cvSchema,
  other: cvSchema,
});
