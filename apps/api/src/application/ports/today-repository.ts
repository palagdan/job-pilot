import type { Route, SkipReason, WorkFormat } from '@job-pilot/shared/enums';

type CardBase = {
  id: string;
  feedStatus: 'new' | 'pursued' | 'skipped' | 'dismissed' | 'expired';
  fitScore: number | null;
  why: string | null;
  gapNote: string | null;
  route: Route;
  routeReason: string | null;
  url: string;
  sourceName: string;
  pipelineItemId: string | null;
  createdAt: Date;
};

export type OpportunityRecord =
  | (CardBase & {
      type: 'job';
      job: {
        title: string;
        company: string;
        location: string | null;
        workFormats: WorkFormat[];
        postedAt: Date | null;
        expiredAt: Date | null;
      };
    })
  | (CardBase & {
      type: 'event';
      event: {
        title: string;
        organizer: string | null;
        startsAt: Date;
        endsAt: Date | null;
        city: string | null;
        online: boolean;
        cancelledAt: Date | null;
      };
    });

export type PipelineItemRecord = {
  id: string;
  opportunityId: string;
  type: 'job' | 'event';
  title: string;
  company: string | null;
  route: Route;
  status: import('@job-pilot/shared/enums').PipelineStatus;
  statusChangedAt: Date;
  sentAt: Date | null;
  registeredAt: Date | null;
  interviewAt: Date | null;
  eventStartsAt: Date | null;
  nextFollowUpAt: Date | null;
  notesCount: number;
  createdAt: Date;
};

export type ActivityRecord = {
  id: string;
  action: string;
  entityId: string;
  before: unknown;
  after: unknown;
  undoableUntil: Date | null;
  undoneAt: Date | null;
};

export type UndoOutcome =
  | 'undone'
  | 'not_found'
  | 'expired'
  | 'already_undone'
  | 'not_undoable'
  | 'changed';

export interface TodayRepository {
  /** Opportunities the user has not acted on yet (feedStatus new/expired), best fit first. */
  listFeed(userId: string, minFit: number): Promise<OpportunityRecord[]>;
  findOwned(userId: string, id: string): Promise<OpportunityRecord | null>;
  readyToSendCount(userId: string): Promise<number>;
  /** Pending follow-ups due by `now` on `sent` items: how many, and the item with the oldest one. */
  followUpsDue(
    userId: string,
    now: Date,
  ): Promise<{ count: number; firstPipelineItemId: string | null }>;
  /** Registered events starting in (now, until], soonest first. */
  eventsStartingBetween(
    userId: string,
    now: Date,
    until: Date,
  ): Promise<{ pipelineItemId: string; title: string; startsAt: Date }[]>;
  setRoute(userId: string, id: string, route: Route, routeReason: string | null): Promise<void>;
  /** feedStatus new → skipped + activity, in one transaction. Adds the company to exclusions for `company_excluded`. */
  skip(input: {
    userId: string;
    id: string;
    reason: SkipReason;
    note: string | null;
    company: string | null;
    now: Date;
    undoableUntil: Date;
  }): Promise<{ activityId: string; addedExclusion: string | null } | null>;
  /** feedStatus new/expired → dismissed + activity. Returns false when the status moved on. */
  dismiss(userId: string, id: string, now: Date): Promise<boolean>;
  /** feedStatus new → pursued + pipeline_item(preparing) + activity. Null when the status moved on. */
  pursue(input: { userId: string; id: string; route: Route; now: Date }): Promise<string | null>;
  findPipelineItem(userId: string, id: string): Promise<PipelineItemRecord | null>;
  findPipelineItemByOpportunity(
    userId: string,
    opportunityId: string,
  ): Promise<PipelineItemRecord | null>;
  /** Replays `before` of an undoable activity and stamps `undoneAt`, atomically. */
  undo(userId: string, token: string, now: Date): Promise<UndoOutcome>;
}
