import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps, timestamptz } from '../columns.ts';
import { user } from './auth.ts';
import { emailStatusEnum, emailTemplateEnum } from './enums.ts';

export const emailLog = pgTable(
  'email_log',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    template: emailTemplateEnum().notNull(),
    /** Guarantees "sent once": "welcome:<userId>", "finish_setup_reminder:<userId>", "run_digest:<runId>". */
    dedupeKey: text().notNull().unique(),
    status: emailStatusEnum().notNull().default('queued'),
    providerMessageId: text(),
    error: text(),
    sentAt: timestamptz(),
    ...timestamps(),
  },
  (t) => [index().on(t.userId, t.createdAt)],
);

export const pushSubscription = pgTable(
  'push_subscription',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    endpoint: text().notNull().unique(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    userAgent: text(),
    /** Set when the push service returns 404/410; such rows are cleaned up. */
    failedAt: timestamptz(),
    ...timestamps(),
  },
  (t) => [index().on(t.userId)],
);
