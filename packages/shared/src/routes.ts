import { z } from 'zod';
import { agentRunSchema, agentStatusSchema } from './agent-run.ts';
import { chatMessageSchema, chatThreadSchema, sendChatMessageInputSchema } from './chat.ts';
import { idSchema, okSchema } from './common.ts';
import {
  cvCompareSchema,
  cvListSchema,
  cvSchema,
  downloadQuerySchema,
  downloadSchema,
  editCvInputSchema,
} from './cv.ts';
import { draftSchema, markSentResultSchema, updateDraftInputSchema } from './draft.ts';
import { chatScreens } from './enums.ts';
import {
  changeRouteInputSchema,
  opportunitySchema,
  skipInputSchema,
  skipResultSchema,
  todayQuerySchema,
  todaySchema,
} from './opportunity.ts';
import { opsSchema } from './ops.ts';
import {
  noteInputSchema,
  noteSchema,
  pipelineItemSchema,
  pipelinePageSchema,
  pipelineQuerySchema,
  pipelineStatsSchema,
  updateStatusInputSchema,
} from './pipeline.ts';
import {
  onboardingLinksInputSchema,
  profileInputSchema,
  profilePatchSchema,
  profileSchema,
} from './profile.ts';
import { pushSubscriptionInputSchema, vapidKeySchema } from './push.ts';
import { reviewListSchema, reviewSchema } from './review.ts';
import { scheduleInputSchema, scheduleSchema } from './schedule.ts';
import {
  suggestionsQuerySchema,
  suggestionsSchema,
  targetsPatchSchema,
  targetsSchema,
  targetsViewSchema,
} from './targets.ts';
import { uploadSchema } from './upload.ts';
import { meSchema, updateSettingsInputSchema } from './user.ts';

/**
 * API contract (contract-first): every endpoint the web calls.
 * - All routes are under `/v1`, require a session (Better Auth cookie) and are scoped to the current user,
 *   unless `public: true`.
 * - Errors use `apiErrorSchema` from `errors.ts`.
 * - Auth itself is Better Auth's handler at `/api/auth/*` (not listed).
 * - `body: 'multipart'` = form-data upload, `response: 'sse'` = text/event-stream, `response: 'file'` = binary.
 * - `owner` = who implements it (see docs/todo.md).
 */
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type RouteDef = {
  method: Method;
  path: `/${string}`;
  owner: 'artem' | 'daniil';
  query?: z.ZodType;
  body?: z.ZodType | 'multipart';
  response: z.ZodType | 'sse' | 'file' | 'redirect';
  public?: true;
};

const idParam = z.object({ id: idSchema });
export const routeParams = { id: idParam };

const undoInputSchema = z.object({ undoToken: z.string() });

export const routes = {
  // ---------- User & settings ----------
  getMe: { method: 'GET', path: '/v1/me', owner: 'artem', response: meSchema },
  updateSettings: {
    method: 'PATCH',
    path: '/v1/me/settings',
    owner: 'artem',
    body: updateSettingsInputSchema,
    response: meSchema,
  },

  // ---------- Onboarding ----------
  /** Step 1: CV upload. When a CV already exists, pass `?replace=true` (C04). Parsing starts right away. */
  uploadCv: {
    method: 'POST',
    path: '/v1/uploads/cv',
    owner: 'artem',
    query: z.object({ replace: z.stringbool().default(false) }),
    body: 'multipart',
    response: uploadSchema,
  },
  /** The user's current (newest, not replaced) CV upload, or `null`. Lets Step 1 resume after a reload. */
  getCurrentUpload: {
    method: 'GET',
    path: '/v1/uploads/current',
    owner: 'daniil',
    response: uploadSchema.nullable(),
  },
  /** Poll parse status (Step 1 "Reading your CV..."). */
  getUpload: { method: 'GET', path: '/v1/uploads/:id', owner: 'artem', response: uploadSchema },
  saveOnboardingLinks: {
    method: 'PUT',
    path: '/v1/onboarding/links',
    owner: 'artem',
    body: onboardingLinksInputSchema,
    response: okSchema,
  },
  /** After Step 4: sets `onboardingCompletedAt`, computes next run, starts master CV generation. */
  completeOnboarding: {
    method: 'POST',
    path: '/v1/onboarding/complete',
    owner: 'artem',
    response: meSchema,
  },

  // ---------- Profile, targets, schedule (onboarding 2-4 + Profile and targets) ----------
  getProfile: { method: 'GET', path: '/v1/profile', owner: 'artem', response: profileSchema },
  putProfile: {
    method: 'PUT',
    path: '/v1/profile',
    owner: 'artem',
    body: profileInputSchema,
    response: profileSchema,
  },
  patchProfile: {
    method: 'PATCH',
    path: '/v1/profile',
    owner: 'artem',
    body: profilePatchSchema,
    response: profileSchema,
  },
  getTargets: { method: 'GET', path: '/v1/targets', owner: 'artem', response: targetsViewSchema },
  putTargets: {
    method: 'PUT',
    path: '/v1/targets',
    owner: 'artem',
    body: targetsSchema,
    response: targetsViewSchema,
  },
  patchTargets: {
    method: 'PATCH',
    path: '/v1/targets',
    owner: 'artem',
    body: targetsPatchSchema,
    response: targetsViewSchema,
  },
  getSuggestions: {
    method: 'GET',
    path: '/v1/suggestions',
    owner: 'artem',
    query: suggestionsQuerySchema,
    response: suggestionsSchema,
  },
  getSchedule: { method: 'GET', path: '/v1/schedule', owner: 'artem', response: scheduleSchema },
  putSchedule: {
    method: 'PUT',
    path: '/v1/schedule',
    owner: 'artem',
    body: scheduleInputSchema,
    response: scheduleSchema,
  },

  // ---------- Agent ----------
  getAgentStatus: {
    method: 'GET',
    path: '/v1/agent/status',
    owner: 'daniil',
    response: agentStatusSchema,
  },
  /** "Run now". 409 `agent_busy` if a run is active. */
  startRun: { method: 'POST', path: '/v1/agent/runs', owner: 'daniil', response: agentRunSchema },
  /** Run progress stream (`agentRunSchema` per event). Polling `getAgentStatus` is the fallback. */
  streamRun: { method: 'GET', path: '/v1/agent/runs/:id/events', owner: 'daniil', response: 'sse' },
  pauseAgent: {
    method: 'POST',
    path: '/v1/agent/pause',
    owner: 'artem',
    response: agentStatusSchema,
  },
  resumeAgent: {
    method: 'POST',
    path: '/v1/agent/resume',
    owner: 'artem',
    response: agentStatusSchema,
  },

  // ---------- Today ----------
  getToday: {
    method: 'GET',
    path: '/v1/today',
    owner: 'daniil',
    query: todayQuerySchema,
    response: todaySchema,
  },
  /** Creates the pipeline item (status `preparing`) and queues pack preparation. */
  pursue: {
    method: 'POST',
    path: '/v1/opportunities/:id/pursue',
    owner: 'daniil',
    response: pipelineItemSchema,
  },
  skip: {
    method: 'POST',
    path: '/v1/opportunities/:id/skip',
    owner: 'daniil',
    body: skipInputSchema,
    response: skipResultSchema,
  },
  /** Expired card → Dismiss. */
  dismiss: {
    method: 'POST',
    path: '/v1/opportunities/:id/dismiss',
    owner: 'daniil',
    response: okSchema,
  },
  changeOpportunityRoute: {
    method: 'PUT',
    path: '/v1/opportunities/:id/route',
    owner: 'daniil',
    body: changeRouteInputSchema,
    response: opportunitySchema,
  },

  /** Generic Undo for toasts (skip, mark as sent, chat change, exclusion added...). */
  undo: {
    method: 'POST',
    path: '/v1/undo',
    owner: 'daniil',
    body: undoInputSchema,
    response: okSchema,
  },

  // ---------- Review (pack) ----------
  /** Items waiting for review (`ready_to_send`), newest first — prev/next navigation. Added with 08 Review. */
  listReview: {
    method: 'GET',
    path: '/v1/review',
    owner: 'daniil',
    response: reviewListSchema,
  },
  /** One call for the Review screen: item + posting/event details + drafts + special CV. Added with 08 Review. */
  getReview: {
    method: 'GET',
    path: '/v1/pipeline/:id/review',
    owner: 'daniil',
    response: reviewSchema,
  },
  getPipelineItem: {
    method: 'GET',
    path: '/v1/pipeline/:id',
    owner: 'artem',
    response: pipelineItemSchema,
  },
  getDrafts: {
    method: 'GET',
    path: '/v1/pipeline/:id/drafts',
    owner: 'daniil',
    response: z.array(draftSchema),
  },
  updateDraft: {
    method: 'PUT',
    path: '/v1/drafts/:id',
    owner: 'daniil',
    body: updateDraftInputSchema,
    response: draftSchema,
  },
  /** "I sent it" (C01) → Sent + follow-up in 5 days. */
  markSent: {
    method: 'POST',
    path: '/v1/pipeline/:id/sent',
    owner: 'daniil',
    response: markSentResultSchema,
  },
  /** "Mark as not sent" from the row menu (after the undo window). */
  markNotSent: {
    method: 'POST',
    path: '/v1/pipeline/:id/not-sent',
    owner: 'daniil',
    response: pipelineItemSchema,
  },
  markRegistered: {
    method: 'POST',
    path: '/v1/pipeline/:id/registered',
    owner: 'daniil',
    response: markSentResultSchema,
  },
  /** E06 "Try again". */
  retryPack: {
    method: 'POST',
    path: '/v1/pipeline/:id/retry',
    owner: 'daniil',
    response: pipelineItemSchema,
  },
  /** Event "Add to calendar". */
  downloadIcs: {
    method: 'GET',
    path: '/v1/pipeline/:id/event.ics',
    owner: 'daniil',
    response: 'file',
  },
  completeFollowUp: {
    method: 'POST',
    path: '/v1/follow-ups/:id/done',
    owner: 'artem',
    response: okSchema,
  },

  // ---------- Pipeline ----------
  listPipeline: {
    method: 'GET',
    path: '/v1/pipeline',
    owner: 'artem',
    query: pipelineQuerySchema,
    response: pipelinePageSchema,
  },
  getPipelineStats: {
    method: 'GET',
    path: '/v1/pipeline/stats',
    owner: 'artem',
    response: pipelineStatsSchema,
  },
  updatePipelineStatus: {
    method: 'PUT',
    path: '/v1/pipeline/:id/status',
    owner: 'artem',
    body: updateStatusInputSchema,
    response: pipelineItemSchema,
  },
  changePipelineRoute: {
    method: 'PUT',
    path: '/v1/pipeline/:id/route',
    owner: 'artem',
    body: changeRouteInputSchema,
    response: pipelineItemSchema,
  },
  /** C06 → Skipped, cancels follow-ups. */
  stopPursuing: {
    method: 'POST',
    path: '/v1/pipeline/:id/stop',
    owner: 'artem',
    response: pipelineItemSchema,
  },
  listNotes: {
    method: 'GET',
    path: '/v1/pipeline/:id/notes',
    owner: 'artem',
    response: z.array(noteSchema),
  },
  addNote: {
    method: 'POST',
    path: '/v1/pipeline/:id/notes',
    owner: 'artem',
    body: noteInputSchema,
    response: noteSchema,
  },

  // ---------- CVs ----------
  listCvs: { method: 'GET', path: '/v1/cvs', owner: 'artem', response: cvListSchema },
  getCv: { method: 'GET', path: '/v1/cvs/:id', owner: 'artem', response: cvSchema },
  /** C02 "Confirm and use this CV". */
  confirmCv: { method: 'POST', path: '/v1/cvs/:id/confirm', owner: 'artem', response: cvSchema },
  /** C03 "Keep my original instead". */
  keepOriginalCv: {
    method: 'POST',
    path: '/v1/cvs/keep-original',
    owner: 'artem',
    response: cvSchema,
  },
  editCv: {
    method: 'PUT',
    path: '/v1/cvs/:id/content',
    owner: 'artem',
    body: editCvInputSchema,
    response: cvSchema,
  },
  /** Master: Daniil's master-CV job; special: Daniil's pack job. Endpoint itself is Artem's. */
  regenerateCv: {
    method: 'POST',
    path: '/v1/cvs/:id/regenerate',
    owner: 'artem',
    response: cvSchema,
  },
  /** C05. Not allowed for the confirmed master. */
  deleteCv: { method: 'DELETE', path: '/v1/cvs/:id', owner: 'artem', response: okSchema },
  /** "Compare with master" / "Compare" (master vs original). */
  compareCv: {
    method: 'GET',
    path: '/v1/cvs/:id/compare',
    owner: 'artem',
    query: z.object({ with: idSchema.optional() }),
    response: cvCompareSchema,
  },
  downloadCv: {
    method: 'GET',
    path: '/v1/cvs/:id/download',
    owner: 'artem',
    query: downloadQuerySchema,
    response: downloadSchema,
  },
  downloadOriginal: {
    method: 'GET',
    path: '/v1/uploads/:id/download',
    owner: 'artem',
    response: downloadSchema,
  },

  // ---------- Chat ----------
  getChat: {
    method: 'GET',
    path: '/v1/chat',
    owner: 'daniil',
    query: z.object({ screen: z.enum(chatScreens) }),
    response: chatThreadSchema,
  },
  /** Streams the assistant answer (text deltas, then the final `chatMessageSchema`). */
  sendChatMessage: {
    method: 'POST',
    path: '/v1/chat/messages',
    owner: 'daniil',
    body: sendChatMessageInputSchema,
    response: 'sse',
  },
  getChatMessage: {
    method: 'GET',
    path: '/v1/chat/messages/:id',
    owner: 'daniil',
    response: chatMessageSchema,
  },

  // ---------- Push ----------
  getVapidKey: {
    method: 'GET',
    path: '/v1/push/vapid-key',
    owner: 'artem',
    response: vapidKeySchema,
  },
  subscribePush: {
    method: 'POST',
    path: '/v1/push/subscriptions',
    owner: 'artem',
    body: pushSubscriptionInputSchema,
    response: okSchema,
  },
  unsubscribePush: {
    method: 'DELETE',
    path: '/v1/push/subscriptions',
    owner: 'artem',
    body: z.object({ endpoint: z.url() }),
    response: okSchema,
  },

  // ---------- Ops (admins only, `ADMIN_EMAILS`) ----------
  getOps: { method: 'GET', path: '/v1/admin/ops', owner: 'artem', response: opsSchema },

  // ---------- Public ----------
  /** One-click unsubscribe from emails (List-Unsubscribe). */
  unsubscribeEmail: {
    method: 'POST',
    path: '/v1/email/unsubscribe',
    owner: 'artem',
    query: z.object({ token: z.string() }),
    response: okSchema,
    public: true,
  },
  health: {
    method: 'GET',
    path: '/health',
    owner: 'artem',
    response: z.object({ status: z.literal('ok') }),
    public: true,
  },
} as const satisfies Record<string, RouteDef>;

export type RouteName = keyof typeof routes;

/**
 * Not called by the web, listed for completeness:
 * - POST /webhooks/apify — Apify run finished (signed secret) → enqueue `ingest-dataset` (Daniil)
 */
