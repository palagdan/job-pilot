import { z } from 'zod';
import { dateTimeSchema, idSchema, undoableSchema } from './common.ts';
import { draftKinds } from './enums.ts';
import { limits, messages } from './limits.ts';

export const draftSchema = z.object({
  id: idSchema,
  pipelineItemId: idSchema,
  kind: z.enum(draftKinds),
  /** Form answers: "Why this company?", "Salary expectations", "Notice period"... */
  label: z.string().nullable(),
  body: z.string(),
  /** Platform character limit shown as a counter, if any. */
  charLimit: z.number().int().nullable(),
  version: z.number().int(),
  editedByUser: z.boolean(),
  updatedAt: dateTimeSchema,
});
export type Draft = z.infer<typeof draftSchema>;

export const updateDraftInputSchema = z.object({
  body: z.string().trim().min(1, messages.draftEmpty).max(limits.draftBody.max),
  /** Optimistic concurrency: the version the user edited. */
  version: z.number().int(),
});

/** "I sent it" / "I registered" → status + follow-up; undo with the token for 10 s. */
export const markSentResultSchema = undoableSchema.extend({
  nextFollowUpAt: dateTimeSchema.nullable(),
});
