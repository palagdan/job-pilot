import type { PipelineItemRecord } from './today-repository.ts';

export type ReviewItemRecord = PipelineItemRecord & {
  specialCvId: string | null;
  url: string;
  sourceName: string;
  location: string | null;
  postingUnavailable: boolean;
  event: {
    organizer: string | null;
    startsAt: Date;
    endsAt: Date | null;
    city: string | null;
    online: boolean;
    venue: string | null;
    description: string | null;
  } | null;
};

export type DraftRecord = {
  id: string;
  pipelineItemId: string;
  kind: 'cover_text' | 'form_answer' | 'follow_up' | 'event_prep';
  label: string | null;
  body: string;
  charLimit: number | null;
  version: number;
  editedByUserAt: Date | null;
  updatedAt: Date;
};

export type FollowUpRecord = {
  id: string;
  sequence: number;
  dueAt: Date;
  status: 'pending' | 'done' | 'cancelled';
  completedAt: Date | null;
  draftId: string | null;
};

export type CompleteFollowUpResult =
  | { ok: true; activityId: string; nextFollowUpAt: Date | null }
  | { ok: false; reason: 'not_found' | 'wrong_state' };

export type MarkResult =
  | { ok: true; activityId: string; nextFollowUpAt: Date | null }
  | { ok: false; reason: 'not_found' | 'wrong_state' };

export interface ReviewRepository {
  /** Items with status `ready_to_send`, newest first. */
  listWaiting(userId: string): Promise<ReviewItemRecord[]>;
  find(userId: string, id: string): Promise<ReviewItemRecord | null>;
  listDrafts(userId: string, itemId: string): Promise<DraftRecord[]>;
  findDraft(userId: string, id: string): Promise<DraftRecord | null>;
  /** Updates only when `version` still matches; null = the version moved on (or the draft is gone). */
  updateDraft(input: {
    userId: string;
    id: string;
    body: string;
    version: number;
    now: Date;
  }): Promise<DraftRecord | null>;
  /**
   * `ready_to_send` → `sent` (job) / `registered` (event) + activity (undoable). `followUpDueAt` (jobs) also
   * creates follow_up #1 and sets `nextFollowUpAt`.
   */
  markDone(input: {
    userId: string;
    id: string;
    kind: 'sent' | 'registered';
    now: Date;
    followUpDueAt: Date | null;
    undoableUntil: Date;
  }): Promise<MarkResult>;
  /** Follow-ups of one item, by sequence. */
  listFollowUps(userId: string, itemId: string): Promise<FollowUpRecord[]>;
  /**
   * Pending follow-up of a `sent` item → `done` + activity (undoable). Sequence 1 also creates #2 due at
   * `nextDueAt`; `nextFollowUpAt` of the item follows the next pending follow-up.
   */
  completeFollowUp(input: {
    userId: string;
    id: string;
    now: Date;
    nextDueAt: Date;
    undoableUntil: Date;
  }): Promise<CompleteFollowUpResult>;
  /** `sent` / `registered` → `ready_to_send`; pending follow-ups cancelled. Returns the new status or a failure. */
  markNotSent(
    userId: string,
    id: string,
    now: Date,
  ): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'wrong_state' }>;
}
