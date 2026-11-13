import { z } from 'zod';
import { dateTimeSchema, idSchema, undoableSchema } from './common.ts';
import { feedStatuses, opportunityTypes, routes, skipReasons, workFormats } from './enums.ts';
import { limits } from './limits.ts';

export const routeOptionSchema = z.object({
  route: z.enum(routes),
  available: z.boolean(),
  /** Why the route is disabled, e.g. "No upcoming events". */
  unavailableReason: z.string().nullable(),
});

const opportunityBaseSchema = z.object({
  id: idSchema,
  feedStatus: z.enum(feedStatuses),
  fitScore: z.number().int().min(0).max(100).nullable(),
  /** "Matches your paid acquisition and team lead experience." */
  why: z.string().nullable(),
  /** "Gap check: 1 keyword missing in your CV" */
  gapNote: z.string().nullable(),
  route: z.enum(routes),
  /** "Register and prep talking points" */
  routeReason: z.string().nullable(),
  routeOptions: z.array(routeOptionSchema),
  url: z.url(),
  sourceName: z.string(),
  /** Set once pursued. */
  pipelineItemId: idSchema.nullable(),
  createdAt: dateTimeSchema,
});

export const jobOpportunitySchema = opportunityBaseSchema.extend({
  type: z.literal('job'),
  job: z.object({
    title: z.string(),
    company: z.string(),
    location: z.string().nullable(),
    workFormats: z.array(z.enum(workFormats)),
    postedAt: dateTimeSchema.nullable(),
  }),
});

export const eventOpportunitySchema = opportunityBaseSchema.extend({
  type: z.literal('event'),
  event: z.object({
    title: z.string(),
    organizer: z.string().nullable(),
    startsAt: dateTimeSchema,
    endsAt: dateTimeSchema.nullable(),
    city: z.string().nullable(),
    online: z.boolean(),
  }),
});

export const opportunitySchema = z.discriminatedUnion('type', [
  jobOpportunitySchema,
  eventOpportunitySchema,
]);
export type Opportunity = z.infer<typeof opportunitySchema>;

export const todayQuerySchema = z.object({
  type: z.enum(opportunityTypes).optional(),
});

export const todaySchema = z.object({
  items: z.array(opportunitySchema),
  counts: z.object({ all: z.number().int(), job: z.number().int(), event: z.number().int() }),
  readyToSendCount: z.number().int(),
  /** Banner "N follow-ups due": pending follow-ups of sent applications that are due now. */
  followUpsDue: z.object({
    count: z.number().int(),
    /** Pipeline item to open in Review (the one most overdue). */
    firstPipelineItemId: z.string().nullable(),
  }),
  /** Banner "Event tomorrow": registered events starting within the next 24 h, soonest first. */
  eventsTomorrow: z.array(
    z.object({ pipelineItemId: z.string(), title: z.string(), startsAt: dateTimeSchema }),
  ),
});
export type Today = z.infer<typeof todaySchema>;

export const skipInputSchema = z
  .object({
    reason: z.enum(skipReasons).default('just_skip'),
    /** Only for `other`. */
    note: z.string().trim().max(limits.skipNote.max).nullable().default(null),
  })
  .refine((s) => s.reason === 'other' || s.note === null, {
    path: ['note'],
    message: 'Note is only for "Other".',
  });
export type SkipInput = z.infer<typeof skipInputSchema>;

export const skipResultSchema = undoableSchema.extend({
  /** Set when reason = company_excluded: the company was added to exclusions. */
  addedExclusion: z.string().nullable(),
});

export const changeRouteInputSchema = z.object({ route: z.enum(routes) });
