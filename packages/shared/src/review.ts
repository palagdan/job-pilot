import { z } from 'zod';
import { dateTimeSchema } from './common.ts';
import { cvSummarySchema } from './cv.ts';
import { draftSchema } from './draft.ts';
import { pipelineItemSchema } from './pipeline.ts';

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
  /** Ordered by position. */
  drafts: z.array(draftSchema),
  /** Direct route only. Download via `downloadCv`. */
  specialCv: cvSummarySchema.nullable(),
});
export type Review = z.infer<typeof reviewSchema>;

/** Items waiting for review (status `ready_to_send`), for prev/next navigation. */
export const reviewListSchema = z.object({ items: z.array(pipelineItemSchema) });
export type ReviewList = z.infer<typeof reviewListSchema>;
