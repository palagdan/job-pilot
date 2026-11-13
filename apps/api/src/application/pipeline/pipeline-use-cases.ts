import type { Logger } from '@job-pilot/logger/logger';
import { pipelineStatuses, pipelineStatusGroups, type Route } from '@job-pilot/shared/enums';
import { AppError } from '@job-pilot/shared/errors';
import type { manualStatuses, PipelineItem, PipelineQuery } from '@job-pilot/shared/pipeline';
import { loadUser } from '../onboarding/onboarding-rules.ts';
import type { AgentJobQueue } from '../ports/job-queue.ts';
import type {
  NoteRecord,
  PipelineItemRecord,
  PipelineRepository,
} from '../ports/pipeline-repository.ts';
import type { UserRepository } from '../ports/user-repository.ts';

export type PipelineDeps = {
  pipeline: PipelineRepository;
  users: UserRepository;
  agentJobs: AgentJobQueue;
  log: Logger;
  now?: () => Date;
};

const clock = (deps: { now?: () => Date }) => (deps.now ?? (() => new Date()))();

/** "18 Nov" / "Thu 19 Nov, 18:00" in the user's time zone. */
const formatDay = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone }).format(d);
const formatDayTime = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(d);

/** Text for the "Next follow-up" column (Figma 10): what the user does next, or when. */
export const nextStepText = (r: PipelineItemRecord, now: Date, timeZone: string): string | null => {
  switch (r.status) {
    case 'preparing':
      return 'Preparing your pack';
    case 'ready_to_send':
      return r.type === 'event' ? 'Register yourself' : 'Send it yourself';
    case 'failed':
      return 'Pack failed - try again';
    case 'sent': {
      const due = r.followUp?.dueAt ?? r.nextFollowUpAt;
      if (!due) return 'Wait for a reply';
      const second = (r.followUp?.sequence ?? 1) > 1;
      if (due <= now) return second ? 'Second follow-up due' : 'Follow-up due';
      return `${second ? 'Second follow-up' : 'Follow up'} on ${formatDay(due, timeZone)}`;
    }
    case 'registered':
      return r.eventStartsAt ? formatDayTime(r.eventStartsAt, timeZone) : 'Go to the event';
    case 'replied':
      return 'Reply to them';
    case 'interview':
      return r.interviewAt ? formatDayTime(r.interviewAt, timeZone) : 'Set the interview date';
    case 'offer':
      return 'Decide on the offer';
    case 'no_reply':
      return 'Try another route';
    default:
      return null;
  }
};

export const toPipelineItem = (
  r: PipelineItemRecord,
  now: Date,
  timeZone: string,
): PipelineItem => ({
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
  nextStep: nextStepText(r, now, timeZone),
  specialCvId: r.specialCvId,
  followUp: r.followUp
    ? {
        id: r.followUp.id,
        sequence: r.followUp.sequence,
        dueAt: r.followUp.dueAt.toISOString(),
        due: r.followUp.dueAt <= now,
      }
    : null,
  notesCount: r.notesCount,
  createdAt: r.createdAt.toISOString(),
});

const toNote = (n: NoteRecord) => ({
  id: n.id,
  body: n.body,
  createdAt: n.createdAt.toISOString(),
});

const findOrThrow = async (deps: Pick<PipelineDeps, 'pipeline'>, userId: string, id: string) => {
  const found = await deps.pipeline.find(userId, id);
  if (!found) throw new AppError('not_found', 'Pipeline item not found.');
  return found;
};

/** Re-reads the item and maps it with the user's time zone. */
const view = async (deps: PipelineDeps, userId: string, id: string): Promise<PipelineItem> => {
  const user = await loadUser(deps.users, userId);
  return toPipelineItem(await findOrThrow(deps, userId, id), clock(deps), user.timezone);
};

/** Opaque cursor = offset into the sorted list (a user's pipeline is small; keyset paging is not worth it). */
const parseCursor = (cursor: string | undefined) => {
  if (cursor === undefined) return 0;
  if (!/^\d{1,6}$/.test(cursor)) throw new AppError('validation_failed', 'Invalid cursor.');
  return Number(cursor);
};

/** GET /v1/pipeline — filters (status group AND type), sort, cursor paging. */
export async function listPipeline(deps: PipelineDeps, userId: string, query: PipelineQuery) {
  const user = await loadUser(deps.users, userId);
  const offset = parseCursor(query.cursor);
  const rows = await deps.pipeline.list(userId, {
    statuses: query.statusGroup ? pipelineStatusGroups[query.statusGroup] : undefined,
    type: query.type,
    sort: query.sort,
    offset,
    limit: query.limit + 1,
  });
  const now = clock(deps);
  return {
    items: rows.slice(0, query.limit).map((r) => toPipelineItem(r, now, user.timezone)),
    nextCursor: rows.length > query.limit ? String(offset + query.limit) : null,
  };
}

/** GET /v1/pipeline/:id */
export const getPipelineItem = (deps: PipelineDeps, userId: string, id: string) =>
  view(deps, userId, id);

/** Statuses after which a reply can come in (the user marks it by hand: the agent cannot see replies). */
const answerable = ['sent', 'replied', 'interview', 'offer', 'no_reply', 'rejected'] as const;

/** PUT /v1/pipeline/:id/status — Replied / Interview (+ date) / Offer / Rejected. Pending follow-ups are cancelled. */
export async function updatePipelineStatus(
  deps: PipelineDeps,
  userId: string,
  id: string,
  input: { status: (typeof manualStatuses)[number]; interviewAt: string | null },
): Promise<PipelineItem> {
  const item = await findOrThrow(deps, userId, id);
  if (item.type === 'event') {
    throw new AppError('conflict', 'Events have no replies or interviews.');
  }
  if (!(answerable as readonly string[]).includes(item.status)) {
    throw new AppError('conflict', 'Mark it as sent first.');
  }
  const ok = await deps.pipeline.transition(userId, id, {
    from: answerable,
    set: {
      status: input.status,
      ...(input.status === 'interview'
        ? { interviewAt: input.interviewAt ? new Date(input.interviewAt) : null }
        : {}),
    },
    cancelFollowUps: true,
    action: 'pipeline.status',
    now: clock(deps),
  });
  if (!ok) throw new AppError('conflict', 'This item changed meanwhile. Reload and try again.');
  return view(deps, userId, id);
}

/** Same rule as the Today card (Daniil): jobs go direct, events by registering; `auto` lets the agent pick. */
const routeAvailable = (type: PipelineItemRecord['type'], route: Route) =>
  route === 'auto' || (type === 'job' ? route === 'direct' : route === 'event');

/** Before anything was sent the pack can still be rewritten for another route. */
const beforeSending = ['preparing', 'ready_to_send', 'failed'] as const;

/** PUT /v1/pipeline/:id/route — rewrites the pack for the new route (status back to Preparing). */
export async function changePipelineRoute(
  deps: PipelineDeps,
  userId: string,
  id: string,
  route: Route,
): Promise<PipelineItem> {
  const item = await findOrThrow(deps, userId, id);
  if (item.route === route) return view(deps, userId, id);
  if (!(beforeSending as readonly string[]).includes(item.status)) {
    throw new AppError('conflict', 'Already sent: the route is fixed.');
  }
  if (!routeAvailable(item.type, route)) {
    throw new AppError('validation_failed', 'Route not available.', {
      route: item.type === 'job' ? 'Jobs have no event route' : 'Events have no direct application',
    });
  }
  const ok = await deps.pipeline.transition(userId, id, {
    from: beforeSending,
    set: { status: 'preparing', route },
    cancelFollowUps: false,
    action: 'pipeline.change_route',
    now: clock(deps),
  });
  if (!ok) throw new AppError('conflict', 'This item changed meanwhile. Reload and try again.');
  try {
    await deps.agentJobs.enqueuePackPrepare(id);
  } catch (error) {
    // Pursue re-enqueues `preparing` items, and the user can retry; the route change itself is kept.
    deps.log.error('pack.prepare enqueue failed', { pipelineItemId: id, error: String(error) });
  }
  return view(deps, userId, id);
}

/** POST /v1/pipeline/:id/stop — C06 "Stop pursuing?": Skipped, follow-ups cancelled. Idempotent. */
export async function stopPursuing(
  deps: PipelineDeps,
  userId: string,
  id: string,
): Promise<PipelineItem> {
  const item = await findOrThrow(deps, userId, id);
  if (item.status !== 'skipped') {
    const from = pipelineStatuses.filter((s) => s !== 'skipped');
    const ok = await deps.pipeline.transition(userId, id, {
      from,
      set: { status: 'skipped' },
      cancelFollowUps: true,
      action: 'pipeline.stop',
      now: clock(deps),
    });
    if (!ok) throw new AppError('conflict', 'This item changed meanwhile. Reload and try again.');
  }
  return view(deps, userId, id);
}

/** GET /v1/pipeline/:id/notes — newest first. */
export async function listNotes(deps: PipelineDeps, userId: string, id: string) {
  await findOrThrow(deps, userId, id);
  return (await deps.pipeline.listNotes(id)).map(toNote);
}

/** POST /v1/pipeline/:id/notes — "Add note". */
export async function addNote(deps: PipelineDeps, userId: string, id: string, body: string) {
  await findOrThrow(deps, userId, id);
  return toNote(await deps.pipeline.addNote(id, body));
}
