import { idSchema } from '@job-pilot/shared/common';
import { z } from 'zod';

export type JobDefinition = {
  payload: z.ZodType;
  options?: {
    retryLimit?: number;
    retryDelay?: number;
    retryBackoff?: boolean;
    expireInSeconds?: number;
  };
};

/**
 * Every background job. Queue names are `area.action`. Add a job here first, then enqueue it
 * (`queue.send`) and handle it (`queue.work`).
 */
export const jobs = {
  /** Enqueued by the api upload endpoint (Artem). Handled by the worker (Daniil). */
  'cv.parse': {
    payload: z.object({ uploadId: idSchema }),
    options: { retryLimit: 2, retryDelay: 30, expireInSeconds: 300 },
  },
  /** Enqueued by the api after onboarding confirm (Artem). Handled by the worker (Daniil). */
  'cv.generate-master': {
    payload: z.object({ userId: idSchema, uploadId: idSchema.optional() }),
    options: { retryLimit: 2, retryDelay: 30, expireInSeconds: 600 },
  },
  /** Enqueued by the api "Run now" endpoint and by scheduler.tick (Daniil). Handled by the worker (Daniil). */
  'agent.run': {
    payload: z.object({ runId: idSchema }),
    options: { retryLimit: 1, expireInSeconds: 1800 },
  },
  /** Scheduled every minute by the worker (Daniil). Handled by the worker (Daniil). */
  'scheduler.tick': {
    payload: z.object({}),
    options: { retryLimit: 0, expireInSeconds: 60 },
  },
  /** Enqueued by the worker schedule (one per source, keyed) and the dev CLI. Handled by the worker (Daniil). */
  'source.run': {
    payload: z.object({ sourceId: idSchema }),
    options: { retryLimit: 1, expireInSeconds: 120 },
  },
  /** Scheduled every minute by the worker (Daniil). Handled by the worker (Daniil). */
  'apify.poll-runs': {
    payload: z.object({}),
    options: { retryLimit: 0, expireInSeconds: 60 },
  },
  /** Enqueued by the Apify webhook endpoint in the api (Daniil). Handled by the worker (Daniil). */
  'apify.ingest-dataset': {
    payload: z.object({ sourceRunId: idSchema }),
    options: { retryLimit: 3, retryDelay: 60, retryBackoff: true, expireInSeconds: 900 },
  },
  /** Scheduled daily 03:00 Europe/Prague by the worker (Daniil). Handled by the worker (Daniil). */
  'ingest.expire': {
    payload: z.object({}),
    options: { retryLimit: 1, expireInSeconds: 300 },
  },
  /** Enqueued by the api Pursue endpoint (Artem). Handled by the worker (Daniil). */
  'pack.prepare': {
    payload: z.object({ pipelineItemId: idSchema }),
    options: { retryLimit: 2, retryDelay: 30, expireInSeconds: 600 },
  },
  /** Scheduled daily by the worker (Daniil). Handled by the worker (Daniil). */
  'follow-up.check': {
    payload: z.object({}),
    options: { retryLimit: 1, expireInSeconds: 300 },
  },
  /** Enqueued by the api and the worker (Artem). Handled by the worker (Artem). */
  'email.send': {
    payload: z.object({
      template: z.string(),
      userId: idSchema,
      dedupeKey: z.string(),
      data: z.record(z.string(), z.unknown()).default({}),
    }),
    options: { retryLimit: 5, retryDelay: 30, retryBackoff: true, expireInSeconds: 120 },
  },
  /**
   * Enqueued by the agent run when it finishes (Daniil). Handled by the worker (Artem): sends email 04 only if the run
   * found something new (dedupe `run_digest:<runId>`).
   */
  'email.run-digest': {
    payload: z.object({ runId: idSchema }),
    options: { retryLimit: 3, retryDelay: 30, expireInSeconds: 120 },
  },
  /** Scheduled hourly by the worker (Daniil). Handled by the worker (Daniil). Enqueues `email.send` for stalled sign-ups. */
  'email.finish-setup-reminders': {
    payload: z.object({}),
    options: { retryLimit: 1, expireInSeconds: 300 },
  },
} as const satisfies Record<string, JobDefinition>;

export type JobName = keyof typeof jobs;
export type JobPayload<N extends JobName> = z.infer<(typeof jobs)[N]['payload']>;
/** What callers pass to `send` (defaults not yet applied). */
export type JobInput<N extends JobName> = z.input<(typeof jobs)[N]['payload']>;
