import { z } from 'zod';
import { dateTimeSchema } from './common.ts';
import { cvSummarySchema } from './cv.ts';
import { draftSchema } from './draft.ts';
import { followUpStatuses } from './enums.ts';
import { pipelineItemSchema } from './pipeline.ts';

/** A follow-up of a sent application with its drafted text (written by the worker once it is due). */
export const followUpSchema = z.object({
  id: z.string(),
  /** 1 = first (+5 d after sent), 2 = second (+7 d after the first). */
  sequence: z.number().int(),
  dueAt: dateTimeSchema,
  status: z.enum(followUpStatuses),
  completedAt: dateTimeSchema.nullable(),
  /** Null until the follow-up is due and the worker has drafted the text. */
  draft: draftSchema.nullable(),
});
export type FollowUp = z.infer<typeof followUpSchema>;

/** "I sent the follow-up" → follow-up #2 in 7 days after #1; undo with the token for 10 s. */
export const completeFollowUpResultSchema = z.object({
  undoToken: z.string(),
  nextFollowUpAt: dateTimeSchema.nullable(),
});

/** 08 Review: everything the screen needs for one pipeline item in one call. */
export const reviewSchema = z.object({
  item: pipelineItemSchema,
  /** Posting / event page ("Open page"). */
  url: z.string(),
  sourceName: z.string(),
  location: z.string().nullable(),
  /** The posting is gone (job expired / event cancelled): "Open page" shows E07 instead. */
  postingUnavailable: z.boolean(),
  event: z
    .object({
      organizer: z.string().nullable(),
      startsAt: dateTimeSchema,
      endsAt: dateTimeSchema.nullable(),
      city: z.string().nullable(),
      online: z.boolean(),
    })
    .nullable(),
  /** Ordered by position. Follow-up texts are in `followUps`, not here. */
  drafts: z.array(draftSchema),
  /** Sent applications only (empty otherwise), ordered by sequence. */
  followUps: z.array(followUpSchema),
  /** Direct route only. Download via `downloadCv`. */
  specialCv: cvSummarySchema.nullable(),
});
export type Review = z.infer<typeof reviewSchema>;

/** Items waiting for review (status `ready_to_send`), for prev/next navigation. */
export const reviewListSchema = z.object({ items: z.array(pipelineItemSchema) });
export type ReviewList = z.infer<typeof reviewListSchema>;
