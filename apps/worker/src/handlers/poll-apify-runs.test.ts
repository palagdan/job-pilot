import { randomUUID } from 'node:crypto';
import { createDb } from '@job-pilot/db/client';
import { source, sourceRun } from '@job-pilot/db/schema/sources';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pollApifyRuns } from './poll-apify-runs.ts';

const url = process.env.TEST_DATABASE_URL;
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never;

describe.skipIf(!url)('pollApifyRuns', () => {
  const { db, close } = createDb(url ?? 'postgres://x', { max: 2 });
  const key = `test-${randomUUID()}`;
  const getRun = vi.fn();
  const getDatasetItemCount = vi.fn();
  const send = vi.fn();
  const handler = pollApifyRuns({
    db,
    apify: { getRun, getDatasetItemCount },
    queue: { send },
    log,
  });
  let sourceId: string;

  const addRun = async (startedAt = new Date()) => {
    const apifyRunId = `run-${randomUUID()}`;
    const [row] = await db
      .insert(sourceRun)
      .values({ sourceId, apifyRunId, apifyDatasetId: 'ds1', startedAt })
      .returning();
    return row as typeof sourceRun.$inferSelect;
  };
  const reload = async (id: string) =>
    (await db.select().from(sourceRun).where(eq(sourceRun.id, id)))[0];

  beforeEach(async () => {
    getRun.mockReset();
    getDatasetItemCount.mockReset();
    send.mockReset();
    await db.delete(source).where(eq(source.key, key));
    [{ id: sourceId }] = (await db
      .insert(source)
      .values({
        key,
        name: 'Test',
        kind: 'event',
        baseUrl: 'https://example.com',
        apifyActorId: 'user/actor',
        cron: '0 * * * *',
      })
      .returning({ id: source.id })) as [{ id: string }];
  });
  afterAll(async () => {
    await db.delete(source).where(eq(source.key, key));
    await close();
  });

  it('marks a succeeded run, stores counts and cost, enqueues ingest', async () => {
    const r = await addRun();
    getRun.mockResolvedValue({
      id: r.apifyRunId,
      status: 'SUCCEEDED',
      defaultDatasetId: 'ds1',
      finishedAt: '2026-01-01T00:00:00.000Z',
      usageTotalUsd: 0.0042,
    });
    getDatasetItemCount.mockResolvedValue(3);
    await handler({ id: 'j', data: {} });
    expect(await reload(r.id)).toMatchObject({
      status: 'succeeded',
      itemsCount: 3,
      costUsd: '0.0042',
      error: null,
    });
    expect(send).toHaveBeenCalledWith('apify.ingest-dataset', { sourceRunId: r.id });
  });

  it('records the error of a failed run and does not enqueue ingest', async () => {
    const r = await addRun();
    getRun.mockResolvedValue({
      id: r.apifyRunId,
      status: 'FAILED',
      defaultDatasetId: 'ds1',
      statusMessage: 'Actor crashed',
    });
    getDatasetItemCount.mockResolvedValue(0);
    await handler({ id: 'j', data: {} });
    expect(await reload(r.id)).toMatchObject({ status: 'failed', error: 'Actor crashed' });
    expect(send).not.toHaveBeenCalled();
  });

  it('leaves a fresh running run alone and times out a stale one', async () => {
    const fresh = await addRun();
    const stale = await addRun(new Date(Date.now() - 3 * 60 * 60 * 1000));
    getRun.mockImplementation(async (id: string) => ({ id, status: 'RUNNING' }));
    await handler({ id: 'j', data: {} });
    expect((await reload(fresh.id))?.status).toBe('running');
    expect(await reload(stale.id)).toMatchObject({ status: 'timed_out', error: 'stale' });
  });

  it('isolates per-run errors', async () => {
    const bad = await addRun();
    const good = await addRun();
    getRun.mockImplementation(async (id: string) => {
      if (id === bad.apifyRunId) throw new Error('api down');
      return { id, status: 'SUCCEEDED', defaultDatasetId: 'ds1', usageTotalUsd: 0.01 };
    });
    getDatasetItemCount.mockResolvedValue(1);
    await handler({ id: 'j', data: {} });
    expect((await reload(bad.id))?.status).toBe('running');
    expect((await reload(good.id))?.status).toBe('succeeded');
  });
});
