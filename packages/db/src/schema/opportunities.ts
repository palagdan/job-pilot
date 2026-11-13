import { sql } from 'drizzle-orm';
import { check, index, pgTable, smallint, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps, timestamptz } from '../columns.ts';
import { agentRun } from './agent.ts';
import { user } from './auth.ts';
import { feedStatusEnum, opportunityTypeEnum, routeEnum, skipReasonEnum } from './enums.ts';
import { eventListing, jobPosting } from './sources.ts';

/** A job posting or event ranked for one user — a card on Today. */
export const opportunity = pgTable(
  'opportunity',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    agentRunId: uuid().references(() => agentRun.id, { onDelete: 'set null' }),
    type: opportunityTypeEnum().notNull(),
    jobPostingId: uuid().references(() => jobPosting.id),
    eventListingId: uuid().references(() => eventListing.id),
    fitScore: smallint(),
    why: text(),
    gapNote: text(),
    route: routeEnum().notNull().default('auto'),
    routeReason: text(),
    feedStatus: feedStatusEnum().notNull().default('new'),
    skipReason: skipReasonEnum(),
    skipNote: text(),
    feedStatusChangedAt: timestamptz(),
    ...timestamps(),
  },
  (t) => [
    check(
      'opportunity_target',
      sql`(${t.type} = 'job' and ${t.jobPostingId} is not null and ${t.eventListingId} is null)
       or (${t.type} = 'event' and ${t.eventListingId} is not null and ${t.jobPostingId} is null)`,
    ),
    check('opportunity_fit_score', sql`${t.fitScore} is null or ${t.fitScore} between 0 and 100`),
    /** Never show the same posting/event to a user twice. */
    uniqueIndex().on(t.userId, t.jobPostingId),
    uniqueIndex().on(t.userId, t.eventListingId),
    index().on(t.userId, t.feedStatus, t.createdAt),
  ],
);
