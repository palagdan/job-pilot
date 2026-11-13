import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createJobQueue } from './client.ts';

describe('send validation', () => {
  it('rejects an invalid payload without touching the database', async () => {
    const queue = createJobQueue({ connectionString: 'postgres://nobody@127.0.0.1:1/none' });
    await expect(queue.send('cv.parse', { uploadId: 'nope' })).rejects.toThrow();
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)('pg-boss integration', () => {
  it('delivers a typed payload to the worker', async () => {
    const queue = createJobQueue({
      connectionString: process.env.TEST_DATABASE_URL as string,
      schema: 'pgboss_test',
    });
    await queue.start();
    try {
      const uploadId = randomUUID();
      let resolveReceived: (value: string) => void = () => {};
      const received = new Promise<string>((resolve) => {
        resolveReceived = resolve;
      });
      // Ignore jobs left over from earlier runs in the same test database.
      await queue.work('cv.parse', async ({ data }) => {
        if (data.uploadId === uploadId) resolveReceived(data.uploadId);
      });
      await queue.send('cv.parse', { uploadId });
      expect(await received).toBe(uploadId);
    } finally {
      await queue.stop({ graceful: true });
    }
  }, 15_000);
});
