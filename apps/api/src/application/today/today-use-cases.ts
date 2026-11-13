import type { OpportunityType, Route } from '@job-pilot/shared/enums';
import { AppError } from '@job-pilot/shared/errors';
import { limits } from '@job-pilot/shared/limits';
import type { Opportunity, SkipInput, Today } from '@job-pilot/shared/opportunity';
import type { PipelineItem } from '@job-pilot/shared/pipeline';
import type { AgentJobQueue } from '../ports/job-queue.ts';
import type {
  OpportunityRecord,
  PipelineItemRecord,
  TodayRepository,
} from '../ports/today-repository.ts';

export type TodayDeps = { today: TodayRepository; agentJobs: AgentJobQueue; now?: () => Date };

const clock = (deps: { now?: () => Date }) => (deps.now ?? (() => new Date()))();

/** Cards below this fit are not worth the user's attention (the agent keeps them for its own feedback). */
export const MIN_FIT_ON_TODAY = 40;

/** Posting gone (job expired / event cancelled or already started), or already flagged by the agent. */
const isExpired = (r: OpportunityRecord, now: Date): boolean => {
  if (r.feedStatus === 'expired') return true;
  if (r.type === 'job') return r.job.expiredAt !== null;
  return r.event.cancelledAt !== null || r.event.startsAt.getTime() < now.getTime();
};

const routeOptions = (r: OpportunityRecord): Opportunity['routeOptions'] =>
  r.type === 'job'
    ? [
        { route: 'auto', available: true, unavailableReason: null },
        { route: 'direct', available: true, unavailableReason: null },
        { route: 'event', available: false, unavailableReason: 'No upcoming events' },
      ]
    : [
        { route: 'auto', available: true, unavailableReason: null },
        {
          route: 'direct',
          available: false,
          unavailableReason: 'Events have no direct application',
        },
        { route: 'event', available: true, unavailableReason: null },
      ];

const toDto = (r: OpportunityRecord, now: Date): Opportunity => {
  const base = {
    id: r.id,
    feedStatus: isExpired(r, now) && r.feedStatus === 'new' ? ('expired' as const) : r.feedStatus,
    fitScore: r.fitScore,
    why: r.why,
    gapNote: r.gapNote,
    route: r.route,
    routeReason: r.routeReason,
    routeOptions: routeOptions(r),
    url: r.url,
    sourceName: r.sourceName,
    pipelineItemId: r.pipelineItemId,
    createdAt: r.createdAt.toISOString(),
  };
  if (r.type === 'job') {
    return {
      ...base,
      type: 'job',
      job: {
        title: r.job.title,
        company: r.job.company,
        location: r.job.location,
        workFormats: r.job.workFormats,
        postedAt: r.job.postedAt?.toISOString() ?? null,
      },
    };
  }
  return {
    ...base,
    type: 'event',
    event: {
      title: r.event.title,
      organizer: r.event.organizer,
      startsAt: r.event.startsAt.toISOString(),
      endsAt: r.event.endsAt?.toISOString() ?? null,
      city: r.event.city,
      online: r.event.online,
    },
  };
};

const toPipelineDto = (r: PipelineItemRecord): PipelineItem => ({
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
  nextStep: null,
  specialCvId: null,
  notesCount: r.notesCount,
  createdAt: r.createdAt.toISOString(),
});

const findOwnedOrThrow = async (deps: Pick<TodayDeps, 'today'>, userId: string, id: string) => {
  const found = await deps.today.findOwned(userId, id);
  if (!found) throw new AppError('not_found', 'Opportunity not found.');
  return found;
};

/**
 * GET /v1/today — cards the user has not acted on, best fit first (expired ones last, they only offer Dismiss).
 * Cards under `MIN_FIT_ON_TODAY` are hidden. `counts` cover all visible cards (ignoring the `type` filter),
 * so the filter chips can show "Jobs 3 / Events 2".
 */
export async function getToday(
  deps: Pick<TodayDeps, 'today' | 'now'>,
  userId: string,
  type?: OpportunityType,
): Promise<Today> {
  const now = clock(deps);
  const [records, readyToSendCount] = await Promise.all([
    deps.today.listFeed(userId, MIN_FIT_ON_TODAY),
    deps.today.readyToSendCount(userId),
  ]);
  const dtos = records.map((r) => toDto(r, now));
  const live = (d: Opportunity) => d.feedStatus !== 'expired';
  const ordered = [...dtos.filter(live), ...dtos.filter((d) => !live(d))];
  return {
    items: type ? ordered.filter((d) => d.type === type) : ordered,
    counts: {
      all: dtos.length,
      job: dtos.filter((d) => d.type === 'job').length,
      event: dtos.filter((d) => d.type === 'event').length,
    },
    readyToSendCount,
  };
}

/** POST /v1/opportunities/:id/pursue — pipeline item `preparing` + `pack.prepare`. Repeating it returns the same item. */
export async function pursueOpportunity(
  deps: TodayDeps,
  userId: string,
  id: string,
): Promise<PipelineItem> {
  const opp = await findOwnedOrThrow(deps, userId, id);
  const existing = await deps.today.findPipelineItemByOpportunity(userId, id);
  if (existing) {
    // A previous enqueue may have failed: preparing items are queued again (the handler is idempotent).
    if (existing.status === 'preparing') await deps.agentJobs.enqueuePackPrepare(existing.id);
    return toPipelineDto(existing);
  }
  if (isExpired(opp, clock(deps))) {
    throw new AppError('posting_unavailable', 'This posting is no longer available.');
  }
  if (opp.feedStatus !== 'new') {
    throw new AppError('conflict', 'This card was already handled.');
  }
  const itemId = await deps.today.pursue({ userId, id, route: opp.route, now: clock(deps) });
  if (!itemId) throw new AppError('conflict', 'This card was already handled.');
  await deps.agentJobs.enqueuePackPrepare(itemId);
  const created = await deps.today.findPipelineItem(userId, itemId);
  if (!created) throw new AppError('internal', 'Pipeline item missing after pursue.');
  return toPipelineDto(created);
}

/** POST /v1/opportunities/:id/skip — returns the undo token (valid for `limits.undoWindowMs`). */
export async function skipOpportunity(
  deps: Pick<TodayDeps, 'today' | 'now'>,
  userId: string,
  id: string,
  input: SkipInput,
) {
  const opp = await findOwnedOrThrow(deps, userId, id);
  const now = clock(deps);
  const done = await deps.today.skip({
    userId,
    id,
    reason: input.reason,
    note: input.note,
    company: opp.type === 'job' ? opp.job.company : null,
    now,
    undoableUntil: new Date(now.getTime() + limits.undoWindowMs),
  });
  if (!done) throw new AppError('conflict', 'This card was already handled.');
  return { undoToken: done.activityId, addedExclusion: done.addedExclusion };
}

/** POST /v1/opportunities/:id/dismiss — for expired cards (also accepted for any unhandled card). Not undoable. */
export async function dismissOpportunity(
  deps: Pick<TodayDeps, 'today' | 'now'>,
  userId: string,
  id: string,
): Promise<{ ok: true }> {
  await findOwnedOrThrow(deps, userId, id);
  const done = await deps.today.dismiss(userId, id, clock(deps));
  if (!done) throw new AppError('conflict', 'This card was already handled.');
  return { ok: true };
}

/** PUT /v1/opportunities/:id/route — only routes marked `available` in `routeOptions`. */
export async function changeOpportunityRoute(
  deps: Pick<TodayDeps, 'today' | 'now'>,
  userId: string,
  id: string,
  route: Route,
): Promise<Opportunity> {
  const opp = await findOwnedOrThrow(deps, userId, id);
  if (opp.feedStatus === 'pursued')
    throw new AppError('conflict', 'Already pursued: route is fixed.');
  const option = routeOptions(opp).find((o) => o.route === route);
  if (!option?.available) {
    throw new AppError('validation_failed', option?.unavailableReason ?? 'Route not available.', {
      route: option?.unavailableReason ?? 'Route not available.',
    });
  }
  await deps.today.setRoute(userId, id, route, opp.routeReason);
  return toDto(await findOwnedOrThrow(deps, userId, id), clock(deps));
}

/** POST /v1/undo — replays `before` of the activity named by the token, within its undo window. */
export async function undo(
  deps: Pick<TodayDeps, 'today' | 'now'>,
  userId: string,
  token: string,
): Promise<{ ok: true }> {
  const outcome = await deps.today.undo(userId, token, clock(deps));
  switch (outcome) {
    case 'undone':
      return { ok: true };
    case 'not_found':
      throw new AppError('not_found', 'Nothing to undo.');
    case 'expired':
      throw new AppError('conflict', 'Too late to undo.');
    case 'already_undone':
      throw new AppError('conflict', 'Already undone.');
    case 'changed':
      throw new AppError('conflict', 'This card changed since, so it cannot be undone.');
    default:
      throw new AppError('conflict', 'This action cannot be undone.');
  }
}
