import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { id, timestamptz } from '../columns.ts';
import { user } from './auth.ts';
import { activityActorEnum, activityEntityEnum } from './enums.ts';

/**
 * Append-only change log: status history, Undo (`undoToken` = activity id, valid until `undoableUntil`),
 * chat-made changes, and feedback for the agent (skip reasons, edits).
 */
export const activity = pgTable(
  'activity',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    actor: activityActorEnum().notNull(),
    entity: activityEntityEnum().notNull(),
    entityId: uuid().notNull(),
    /** e.g. "pipeline.mark_sent", "targets.add_exclusion", "opportunity.skip" */
    action: text().notNull(),
    before: jsonb(),
    after: jsonb(),
    undoableUntil: timestamptz(),
    undoneAt: timestamptz(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.createdAt), index().on(t.entity, t.entityId)],
);
