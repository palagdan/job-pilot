import { PgBoss, type SendOptions } from 'pg-boss';
import { type JobInput, type JobName, type JobPayload, jobs } from './definitions.ts';

export type JobQueueConfig = { connectionString: string; schema?: string };

export type JobHandler<N extends JobName> = (job: {
  id: string;
  data: JobPayload<N>;
}) => Promise<void>;

const jobNames = Object.keys(jobs) as JobName[];

export const createJobQueue = ({ connectionString, schema = 'pgboss' }: JobQueueConfig) => {
  const boss = new PgBoss({ connectionString, schema });

  return {
    /** Starts pg-boss and ensures every queue exists. Safe to call on every boot. */
    async start() {
      await boss.start();
      for (const name of jobNames) {
        await boss.createQueue(name, jobs[name].options);
      }
    },

    /** Validates the payload first (no DB access on failure). Returns the job id, or null if deduplicated. */
    async send<N extends JobName>(name: N, payload: JobInput<N>, options?: SendOptions) {
      const data = jobs[name].payload.parse(payload);
      return boss.send(name, data, options);
    },

    /**
     * Handles jobs of one queue. A thrown error (including invalid data) fails the whole batch
     * and pg-boss retries per the queue options. `concurrency` is pg-boss `localConcurrency`.
     */
    async work<N extends JobName>(
      name: N,
      handler: JobHandler<N>,
      options: { batchSize?: number; concurrency?: number } = {},
    ) {
      return boss.work(
        name,
        // pg-boss rejects explicit `undefined` options, so always pass numbers.
        { batchSize: options.batchSize ?? 1, localConcurrency: options.concurrency ?? 1 },
        async (batch) => {
          for (const job of batch) {
            const data = jobs[name].payload.parse(job.data) as JobPayload<N>;
            await handler({ id: job.id, data });
          }
        },
      );
    },

    async schedule<N extends JobName>(
      name: N,
      cron: string,
      payload: JobInput<N>,
      { tz, key }: { tz: string; key?: string },
    ) {
      await boss.schedule(
        name,
        cron,
        jobs[name].payload.parse(payload),
        key ? { tz, key } : { tz },
      );
    },

    /** Removes a schedule created with `schedule(..., { key })`. */
    async unschedule(name: JobName, key?: string) {
      await boss.unschedule(name, key);
    },

    /** Keys of the schedules that exist for a queue (`''` is the default, unkeyed one). */
    async scheduleKeys(name: JobName) {
      return (await boss.getSchedules(name)).map((s) => s.key);
    },

    stop(options?: { graceful?: boolean; timeout?: number }) {
      return boss.stop(options);
    },

    onError(listener: (error: Error) => void) {
      boss.on('error', listener);
    },
  };
};

export type JobQueue = ReturnType<typeof createJobQueue>;
