import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps, timestamptz } from '../columns.ts';
import {
  opportunityTypeEnum,
  sourceProviderEnum,
  sourceRunStatusEnum,
  workFormatEnum,
} from './enums.ts';

/**
 * Global ingestion (not per user): Apify actors scrape sources on their own cron, items land in
 * `job_posting` / `event_listing`, and each user's agent run ranks candidates from there.
 */

/** Curated list of job boards and event sites (seeded from Daniil's source research). */
export const source = pgTable(
  'source',
  {
    id: id(),
    /** Stable slug, e.g. "jobs-cz", "luma-prague". */
    key: text().notNull().unique(),
    name: text().notNull(),
    kind: opportunityTypeEnum().notNull(),
    baseUrl: text().notNull(),
    provider: sourceProviderEnum().notNull().default('apify'),
    /** "username/actor-name"; null when the provider is not Apify. */
    apifyActorId: text(),
    /** Actor input; the ingestion job fills in placeholders. */
    inputTemplate: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    /** Cron expression, e.g. "0 *\/6 * * *". */
    cron: text().notNull(),
    enabled: boolean().notNull().default(true),
    /** ToS / legal notes from the research. */
    notes: text(),
    ...timestamps(),
  },
  (t) => [
    check(
      'source_apify_actor_required',
      sql`(${t.provider} = 'apify' and ${t.apifyActorId} is not null) or (${t.provider} <> 'apify' and ${t.apifyActorId} is null)`,
    ),
  ],
);

/** One Apify actor run (ops view: runs, items, failures per source). */
export const sourceRun = pgTable(
  'source_run',
  {
    id: id(),
    sourceId: uuid()
      .notNull()
      .references(() => source.id, { onDelete: 'cascade' }),
    apifyRunId: text().notNull().unique(),
    apifyDatasetId: text(),
    status: sourceRunStatusEnum().notNull().default('running'),
    startedAt: timestamptz().notNull().defaultNow(),
    finishedAt: timestamptz(),
    itemsCount: integer(),
    /** Items that passed validation and were upserted. */
    ingestedCount: integer(),
    /** Apify usage in USD, for the ops view. */
    costUsd: numeric({ precision: 10, scale: 4 }),
    error: text(),
  },
  (t) => [index().on(t.sourceId, t.startedAt)],
);

export const jobPosting = pgTable(
  'job_posting',
  {
    id: id(),
    sourceId: uuid()
      .notNull()
      .references(() => source.id),
    externalId: text(),
    url: text().notNull(),
    canonicalUrl: text().notNull(),
    /** hash(canonical URL) or hash(company + title + city) — dedupes across sources and runs. */
    dedupeKey: text().notNull().unique(),
    title: text().notNull(),
    company: text().notNull(),
    description: text(),
    locationRaw: text(),
    city: text(),
    region: text(),
    /** ISO 3166-1 alpha-2 */
    country: text(),
    workFormats: workFormatEnum().array().notNull().default([]),
    /** ISO 639-1 of the posting text. */
    language: text(),
    salaryRaw: text(),
    postedAt: timestamptz(),
    firstSeenAt: timestamptz().notNull().defaultNow(),
    lastSeenAt: timestamptz().notNull().defaultNow(),
    /** Not seen in N ingestion runs, or the link is dead. */
    expiredAt: timestamptz(),
    raw: jsonb().notNull(),
    ...timestamps(),
  },
  (t) => [index().on(t.lastSeenAt), index().on(t.country, t.city)],
);

export const eventListing = pgTable(
  'event_listing',
  {
    id: id(),
    sourceId: uuid()
      .notNull()
      .references(() => source.id),
    externalId: text(),
    url: text().notNull(),
    dedupeKey: text().notNull().unique(),
    title: text().notNull(),
    organizer: text(),
    description: text(),
    startsAt: timestamptz().notNull(),
    endsAt: timestamptz(),
    venue: text(),
    city: text(),
    country: text(),
    online: boolean().notNull().default(false),
    language: text(),
    firstSeenAt: timestamptz().notNull().defaultNow(),
    lastSeenAt: timestamptz().notNull().defaultNow(),
    cancelledAt: timestamptz(),
    raw: jsonb().notNull(),
    ...timestamps(),
  },
  (t) => [index().on(t.startsAt)],
);
