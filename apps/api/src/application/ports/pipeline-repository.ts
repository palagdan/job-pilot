import type { OpportunityType, PipelineSort, PipelineStatus, Route } from '@job-pilot/shared/enums';

/** A pipeline item joined with its opportunity (title, company), special CV and notes count. */
export type PipelineItemRecord = {
  id: string;
  opportunityId: string;
  type: OpportunityType;
  title: string;
  /** Job company, or event organizer. */
  company: string | null;
  route: Route;
  status: PipelineStatus;
  statusChangedAt: Date;
  sentAt: Date | null;
  registeredAt: Date | null;
  interviewAt: Date | null;
  eventStartsAt: Date | null;
  nextFollowUpAt: Date | null;
  specialCvId: string | null;
  /** The earliest pending follow-up, if any. */
  followUp: { id: string; sequence: number; dueAt: Date } | null;
  notesCount: number;
  createdAt: Date;
};

export type PipelineListQuery = {
  statuses?: readonly PipelineStatus[];
  type?: OpportunityType;
  sort: PipelineSort;
  offset: number;
  limit: number;
};

/** One status/route change, applied only while the item is still in one of `from` (no lost updates). */
export type PipelineTransition = {
  from: readonly PipelineStatus[];
  set: { status: PipelineStatus; interviewAt?: Date | null; route?: Route };
  /** Pending follow-ups → cancelled, `next_follow_up_at` cleared (reply, rejection, stop pursuing). */
  cancelFollowUps: boolean;
  /** Activity log action, e.g. "pipeline.status". */
  action: string;
  now: Date;
};

export type FollowUpRecord = {
  id: string;
  pipelineItemId: string;
  sequence: number;
  status: 'pending' | 'done' | 'cancelled';
  itemStatus: PipelineStatus;
};

export type NoteRecord = { id: string; body: string; createdAt: Date };

export interface PipelineRepository {
  /** Number of the user's pipeline items per status. */
  countByStatus(userId: string): Promise<Partial<Record<PipelineStatus, number>>>;
  list(userId: string, query: PipelineListQuery): Promise<PipelineItemRecord[]>;
  find(userId: string, id: string): Promise<PipelineItemRecord | null>;
  /** Applies the change and writes an `activity` row, in one transaction. False when the status moved meanwhile. */
  transition(userId: string, id: string, change: PipelineTransition): Promise<boolean>;
  /** A follow-up of one of the user's items. */
  findFollowUp(userId: string, id: string): Promise<FollowUpRecord | null>;
  /**
   * Marks a pending follow-up done, optionally schedules the next one (`nextDueAt`), re-derives the item's
   * `next_follow_up_at` and logs the change, in one transaction. False when it was no longer pending.
   */
  completeFollowUp(
    userId: string,
    id: string,
    change: { now: Date; nextSequence: number | null; nextDueAt: Date | null },
  ): Promise<boolean>;
  /** Newest first. The caller checks ownership of the item. */
  listNotes(pipelineItemId: string): Promise<NoteRecord[]>;
  addNote(pipelineItemId: string, body: string): Promise<NoteRecord>;
}
