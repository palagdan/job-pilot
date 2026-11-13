import type { Draft } from '@job-pilot/shared/draft';
import { AppError } from '@job-pilot/shared/errors';
import { limits } from '@job-pilot/shared/limits';
import type { PipelineItem } from '@job-pilot/shared/pipeline';
import type { Review, ReviewList } from '@job-pilot/shared/review';
import { toCvSummary } from '../cvs/cv-use-cases.ts';
import type { CvRepository } from '../ports/cv-repository.ts';
import type {
  DraftRecord,
  ReviewItemRecord,
  ReviewRepository,
} from '../ports/review-repository.ts';
import { buildIcs } from './ics.ts';

export type ReviewDeps = { review: ReviewRepository; cvs: CvRepository; now?: () => Date };

const clock = (deps: { now?: () => Date }) => (deps.now ?? (() => new Date()))();

/** First follow-up is due this long after sending (spec §5 / §8.5). */
export const FIRST_FOLLOW_UP_DAYS = 5;

const day = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const toPipelineDto = (r: ReviewItemRecord): PipelineItem => ({
  id: r.id,
  opportunityId: r.opportunityId,
  type: r.type,
  title: r.title,
  company: r.company,
  route: r.route,
  status: r.status,
  statusChangedAt: r.statusChangedAt.toISOString(),
  sentAt: r.sentAt?.toISOString() ?? null,
  registeredAt: r.registeredAt?.toISOString() ?? null,
  interviewAt: r.interviewAt?.toISOString() ?? null,
  eventStartsAt: r.eventStartsAt?.toISOString() ?? null,
  nextFollowUpAt: r.nextFollowUpAt?.toISOString() ?? null,
  nextStep: r.nextFollowUpAt ? `Follow up on ${day(r.nextFollowUpAt)}` : null,
  specialCvId: r.specialCvId,
  notesCount: r.notesCount,
  createdAt: r.createdAt.toISOString(),
});

const toDraftDto = (r: DraftRecord): Draft => ({
  id: r.id,
  pipelineItemId: r.pipelineItemId,
  kind: r.kind,
  label: r.label,
  body: r.body,
  charLimit: r.charLimit,
  version: r.version,
  editedByUser: r.editedByUserAt !== null,
  updatedAt: r.updatedAt.toISOString(),
});

const findOrThrow = async (deps: Pick<ReviewDeps, 'review'>, userId: string, id: string) => {
  const found = await deps.review.find(userId, id);
  if (!found) throw new AppError('not_found', 'Application not found.');
  return found;
};

/** GET /v1/review — items waiting for review, for prev/next navigation. */
export async function listReview(
  deps: Pick<ReviewDeps, 'review'>,
  userId: string,
): Promise<ReviewList> {
  return { items: (await deps.review.listWaiting(userId)).map(toPipelineDto) };
}

/** GET /v1/pipeline/:id — the item itself (`getPipelineItem` in the contract). */
export async function getPipelineItem(
  deps: Pick<ReviewDeps, 'review'>,
  userId: string,
  id: string,
): Promise<PipelineItem> {
  return toPipelineDto(await findOrThrow(deps, userId, id));
}

/** GET /v1/pipeline/:id/drafts */
export async function getDrafts(
  deps: Pick<ReviewDeps, 'review'>,
  userId: string,
  id: string,
): Promise<Draft[]> {
  await findOrThrow(deps, userId, id);
  return (await deps.review.listDrafts(userId, id)).map(toDraftDto);
}

/** GET /v1/pipeline/:id/review */
export async function getReview(deps: ReviewDeps, userId: string, id: string): Promise<Review> {
  const found = await findOrThrow(deps, userId, id);
  const drafts = await deps.review.listDrafts(userId, id);
  const specialCv = found.specialCvId ? await deps.cvs.findOwned(found.specialCvId, userId) : null;
  return {
    item: toPipelineDto(found),
    url: found.url,
    sourceName: found.sourceName,
    location: found.location,
    postingUnavailable: found.postingUnavailable,
    event: found.event && {
      organizer: found.event.organizer,
      startsAt: found.event.startsAt.toISOString(),
      endsAt: found.event.endsAt?.toISOString() ?? null,
      city: found.event.city,
      online: found.event.online,
    },
    drafts: drafts.map(toDraftDto),
    specialCv: specialCv ? toCvSummary(specialCv) : null,
  };
}

/**
 * PUT /v1/drafts/:id — optimistic locking on `version` (409 when someone else saved first), not empty
 * (already checked by the schema), within the platform `charLimit` when the draft has one.
 */
export async function updateDraft(
  deps: Pick<ReviewDeps, 'review' | 'now'>,
  userId: string,
  id: string,
  input: { body: string; version: number },
): Promise<Draft> {
  const current = await deps.review.findDraft(userId, id);
  if (!current) throw new AppError('not_found', 'Draft not found.');
  if (current.charLimit !== null && input.body.length > current.charLimit) {
    const message = `Keep this under ${current.charLimit} characters.`;
    throw new AppError('validation_failed', message, { body: message });
  }
  const saved = await deps.review.updateDraft({
    userId,
    id,
    body: input.body,
    version: input.version,
    now: clock(deps),
  });
  if (!saved) {
    throw new AppError(
      'conflict',
      'This text was changed somewhere else. Reload to see the latest version.',
    );
  }
  return toDraftDto(saved);
}

const mark = async (
  deps: Pick<ReviewDeps, 'review' | 'now'>,
  userId: string,
  id: string,
  kind: 'sent' | 'registered',
) => {
  const now = clock(deps);
  const followUpDueAt =
    kind === 'sent' ? new Date(now.getTime() + FIRST_FOLLOW_UP_DAYS * 86_400_000) : null;
  const res = await deps.review.markDone({
    userId,
    id,
    kind,
    now,
    followUpDueAt,
    undoableUntil: new Date(now.getTime() + limits.undoWindowMs),
  });
  if (!res.ok) {
    if (res.reason === 'not_found') throw new AppError('not_found', 'Application not found.');
    throw new AppError(
      'conflict',
      kind === 'sent'
        ? 'This application is not waiting to be sent.'
        : 'This event is not waiting for registration.',
    );
  }
  return { undoToken: res.activityId, nextFollowUpAt: res.nextFollowUpAt?.toISOString() ?? null };
};

/** POST /v1/pipeline/:id/sent — Direct jobs: Sent + follow-up #1 in 5 days. */
export const markSent = (deps: Pick<ReviewDeps, 'review' | 'now'>, userId: string, id: string) =>
  mark(deps, userId, id, 'sent');

/** POST /v1/pipeline/:id/registered — Events: Registered, no follow-up. */
export const markRegistered = (
  deps: Pick<ReviewDeps, 'review' | 'now'>,
  userId: string,
  id: string,
) => mark(deps, userId, id, 'registered');

/** POST /v1/pipeline/:id/not-sent — back to Ready to send, follow-ups cancelled. */
export async function markNotSent(
  deps: ReviewDeps,
  userId: string,
  id: string,
): Promise<PipelineItem> {
  const res = await deps.review.markNotSent(userId, id, clock(deps));
  if (!res.ok) {
    if (res.reason === 'not_found') throw new AppError('not_found', 'Application not found.');
    throw new AppError(
      'conflict',
      'Only a sent or registered application can be marked as not sent.',
    );
  }
  return toPipelineDto(await findOrThrow(deps, userId, id));
}

/** GET /v1/pipeline/:id/event.ics — events only. */
export async function eventIcs(
  deps: Pick<ReviewDeps, 'review' | 'now'>,
  userId: string,
  id: string,
): Promise<{ filename: string; content: string }> {
  const found = await findOrThrow(deps, userId, id);
  if (!found.event) throw new AppError('conflict', 'Only events have a calendar entry.');
  const e = found.event;
  const location = [e.online ? 'Online' : null, e.venue, e.city].filter(Boolean).join(', ') || null;
  const slug =
    found.title
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 60) || 'event';
  return {
    filename: `${slug}.ics`,
    content: buildIcs({
      uid: found.id,
      title: found.title,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      location,
      url: found.url,
      description: e.description,
      now: clock(deps),
    }),
  };
}
