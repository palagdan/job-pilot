import type { ChatContext } from '@job-pilot/shared/chat';
import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps, timestamptz } from '../columns.ts';
import { user } from './auth.ts';
import { chatRoleEnum } from './enums.ts';

/** One thread per user for v1 (the panel is the same on every screen). */
export const chatThread = pgTable('chat_thread', {
  id: id(),
  userId: uuid()
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  ...timestamps(),
});

export const chatMessage = pgTable(
  'chat_message',
  {
    id: id(),
    threadId: uuid()
      .notNull()
      .references(() => chatThread.id, { onDelete: 'cascade' }),
    role: chatRoleEnum().notNull(),
    content: text().notNull(),
    context: jsonb().$type<ChatContext>(),
    /** OpenAI-format tool calls / tool results. */
    toolCalls: jsonb(),
    /** Changes applied by this message (→ activity, undoable). */
    activityIds: uuid().array(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [index().on(t.threadId, t.createdAt)],
);
