import { z } from 'zod';
import { cursorPageQuerySchema, dateTimeSchema, idSchema, pageSchema } from './common.ts';
import {
  opportunityTypes,
  pipelineSorts,
  pipelineStatuses,
  pipelineStatusGroups,
  routes,
} from './enums.ts';
import { limits } from './limits.ts';

const statusGroupKeys = Object.keys(pipelineStatusGroups) as [keyof typeof pipelineStatusGroups];

export const pipelineQuerySchema = cursorPageQuerySchema.extend({
  statusGroup: z.enum(statusGroupKeys).optional(),
  type: z.enum(opportunityTypes).optional(),
  sort: z.enum(pipelineSorts).default('next_follow_up'),
});
export type PipelineQuery = z.infer<typeof pipelineQuerySchema>;

/** The next pending follow-up of a sent application (1st: 5 days after sending, 2nd: 7 days after the 1st). */
export const nextFollowUpSchema = z.object({
  id: idSchema,
  sequence: z.number().int(),
  dueAt: dateTimeSchema,
  /** Due now or overdue: Pipeline shows "Follow-up due" and "Mark follow-up as sent". */
  due: z.boolean(),
});
export type NextFollowUp = z.infer<typeof nextFollowUpSchema>;

export const pipelineItemSchema = z.object({
  id: idSchema,
  opportunityId: idSchema,
  type: z.enum(opportunityTypes),
  /** "Head of Growth - Company D" / event title */
  title: z.string(),
  company: z.string().nullable(),
  route: z.enum(routes),
  status: z.enum(pipelineStatuses),
  statusChangedAt: dateTimeSchema,
  sentAt: dateTimeSchema.nullable(),
  registeredAt: dateTimeSchema.nullable(),
  interviewAt: dateTimeSchema.nullable(),
  eventStartsAt: dateTimeSchema.nullable(),
  nextFollowUpAt: dateTimeSchema.nullable(),
  /** Text for the "Next follow-up" column: "Follow up on 17 Nov", "Send availability", ... */
  nextStep: z.string().nullable(),
  specialCvId: idSchema.nullable(),
  /** Filled by the Pipeline endpoints; null elsewhere (Today pursue, Review). */
  followUp: nextFollowUpSchema.nullable(),
  notesCount: z.number().int(),
  createdAt: dateTimeSchema,
});
export type PipelineItem = z.infer<typeof pipelineItemSchema>;

export const pipelinePageSchema = pageSchema(pipelineItemSchema);

export const pipelineStatsSchema = z.object({
  readyToSend: z.number().int(),
  sent: z.number().int(),
  replied: z.number().int(),
  interviews: z.number().int(),
  offers: z.number().int(),
});
export type PipelineStats = z.infer<typeof pipelineStatsSchema>;

/** Statuses the user can set by hand (the agent cannot see replies). */
export const manualStatuses = ['replied', 'interview', 'offer', 'rejected'] as const;

export const updateStatusInputSchema = z.object({
  status: z.enum(manualStatuses),
  /** Only for `interview`. */
  interviewAt: dateTimeSchema.nullable().default(null),
});

export const noteSchema = z.object({ id: idSchema, body: z.string(), createdAt: dateTimeSchema });
export const noteInputSchema = z.object({
  body: z.string().trim().min(1).max(limits.noteBody.max),
});
