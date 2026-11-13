import { timestamp, uuid } from 'drizzle-orm/pg-core';

/** All column names are camelCase in TS and snake_case in Postgres (`casing: 'snake_case'`). */

export const id = () => uuid().primaryKey().defaultRandom();

export const timestamptz = () => timestamp({ withTimezone: true, mode: 'date' });

export const timestamps = () => ({
  createdAt: timestamptz().notNull().defaultNow(),
  updatedAt: timestamptz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
