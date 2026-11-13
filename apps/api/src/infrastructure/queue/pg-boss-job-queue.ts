import { createJobQueue } from '@job-pilot/jobs/client';
import type { EmailJobQueue, JobQueue } from '../../application/ports/job-queue.ts';

/** JobQueue port on Daniil's typed pg-boss client (`@job-pilot/jobs`). Call `start()` once at boot. */
export const createPgBossJobQueue = (
  connectionString: string,
): JobQueue & EmailJobQueue & { start(): Promise<void>; stop(): Promise<void> } => {
  const queue = createJobQueue({ connectionString });
  return {
    start: async () => {
      await queue.start();
    },
    stop: async () => {
      await queue.stop({ graceful: true, timeout: 5_000 });
    },
    enqueueCvParse: async (uploadId) => {
      await queue.send('cv.parse', { uploadId });
    },
    enqueueGenerateMasterCv: async (userId, uploadId) => {
      await queue.send('cv.generate-master', { userId, uploadId });
    },
    enqueueWelcomeEmail: async (userId) => {
      await queue.send('email.send', {
        template: 'welcome',
        userId,
        dedupeKey: `welcome:${userId}`,
        data: {},
      });
    },
  };
};
