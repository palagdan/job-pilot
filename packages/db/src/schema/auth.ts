import { boolean, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps, timestamptz } from '../columns.ts';
import { onboardingStepEnum, themeEnum } from './enums.ts';

/**
 * Better Auth tables (user, session, account, verification) + our own user columns.
 * Better Auth must be configured with `advanced.database.generateId: 'uuid'` and the drizzle adapter
 * (`provider: 'pg'`), and `user.additionalFields` for the JobPilot columns it should return.
 */

export const user = pgTable('user', {
  id: id(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  // --- JobPilot ---
  /** IANA time zone, from the browser at sign-up; editable in Schedule. */
  timezone: text().notNull().default('Europe/Prague'),
  theme: themeEnum().notNull().default('system'),
  /** Agent paused (C07): no runs, no emails. */
  pausedAt: timestamptz(),
  onboardingStep: onboardingStepEnum().notNull().default('upload'),
  onboardingCompletedAt: timestamptz(),
  /** Unsubscribed from all emails via the footer link. */
  emailUnsubscribedAt: timestamptz(),
  ...timestamps(),
});

export const session = pgTable(
  'session',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text().notNull().unique(),
    expiresAt: timestamptz().notNull(),
    ipAddress: text(),
    userAgent: text(),
    ...timestamps(),
  },
  (t) => [index().on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Provider's user id (Google `sub`). */
    accountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamptz(),
    refreshTokenExpiresAt: timestamptz(),
    scope: text(),
    password: text(),
    ...timestamps(),
  },
  (t) => [index().on(t.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: id(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamptz().notNull(),
    ...timestamps(),
  },
  (t) => [index().on(t.identifier)],
);
