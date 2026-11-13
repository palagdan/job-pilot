import type { eventListing, jobPosting } from '@job-pilot/db/schema/sources';

type Managed =
  | 'id'
  | 'sourceId'
  | 'dedupeKey'
  | 'firstSeenAt'
  | 'lastSeenAt'
  | 'createdAt'
  | 'updatedAt';

export type MappedJob = Omit<typeof jobPosting.$inferInsert, Managed>;
export type MappedEvent = Omit<typeof eventListing.$inferInsert, Managed>;

export type IngestKind = 'job' | 'event';
