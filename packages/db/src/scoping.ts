import { and, eq, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * User scoping. Every query in a request handler must be limited to the signed-in user, so one user can never
 * read or change another user's rows by guessing an id.
 *
 *   db.select().from(cv).where(ownedBy(cv, userId, eq(cv.id, id)))
 *
 * Tables without `userId` (draft, follow_up, note, chat_message, cv_file) are scoped through their parent:
 * join to `pipeline_item` / `chat_thread` / `cv` and use `ownedBy` on the parent.
 */
export const ownedBy = (
  table: { userId: PgColumn },
  userId: string,
  ...conditions: (SQL | undefined)[]
): SQL => and(eq(table.userId, userId), ...conditions) as SQL;
