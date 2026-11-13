import { index, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps, timestamptz } from '../columns.ts';
import { user } from './auth.ts';
import { draftKindEnum, followUpStatusEnum, pipelineStatusEnum, routeEnum } from './enums.ts';
import { opportunity } from './opportunities.ts';

/** Created on Pursue. Everything in motion. */
export const pipelineItem = pgTable(
  'pipeline_item',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    opportunityId: uuid()
      .notNull()
      .unique()
      .references(() => opportunity.id, { onDelete: 'cascade' }),
    route: routeEnum().notNull(),
    status: pipelineStatusEnum().notNull().default('preparing'),
    statusChangedAt: timestamptz().notNull().defaultNow(),
    sentAt: timestamptz(),
    registeredAt: timestamptz(),
    interviewAt: timestamptz(),
    /** Denormalized from the next pending follow_up, for sorting and the "due today" banner. */
    nextFollowUpAt: timestamptz(),
    failureReason: text(),
    ...timestamps(),
  },
  (t) => [index().on(t.userId, t.status), index().on(t.userId, t.nextFollowUpAt)],
);

export const draft = pgTable(
  'draft',
  {
    id: id(),
    pipelineItemId: uuid()
      .notNull()
      .references(() => pipelineItem.id, { onDelete: 'cascade' }),
    kind: draftKindEnum().notNull(),
    /** Form question for `form_answer`. */
    label: text(),
    body: text().notNull(),
    charLimit: smallint(),
    position: smallint().notNull().default(0),
    version: smallint().notNull().default(1),
    /** Last time the user edited it by hand (null = agent text). */
    editedByUserAt: timestamptz(),
    ...timestamps(),
  },
  (t) => [index().on(t.pipelineItemId, t.position)],
);

export const followUp = pgTable(
  'follow_up',
  {
    id: id(),
    pipelineItemId: uuid()
      .notNull()
      .references(() => pipelineItem.id, { onDelete: 'cascade' }),
    /** 1 = first (+5 d after sent), 2 = second (+7 d after the first). */
    sequence: smallint().notNull(),
    dueAt: timestamptz().notNull(),
    status: followUpStatusEnum().notNull().default('pending'),
    draftId: uuid().references(() => draft.id, { onDelete: 'set null' }),
    completedAt: timestamptz(),
    ...timestamps(),
  },
  (t) => [index().on(t.status, t.dueAt), index().on(t.pipelineItemId)],
);

export const note = pgTable(
  'note',
  {
    id: id(),
    pipelineItemId: uuid()
      .notNull()
      .references(() => pipelineItem.id, { onDelete: 'cascade' }),
    body: text().notNull(),
    ...timestamps(),
  },
  (t) => [index().on(t.pipelineItemId)],
);
