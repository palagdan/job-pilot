import { randomUUID } from 'node:crypto';
import { createDb } from '@job-pilot/db/client';
import { source, sourceRun } from '@job-pilot/db/schema/sources';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startSourceRun } from './start-source-run.ts';

const url = process.env.TEST_DATABASE_URL;
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never;

describe.skipIf(!url)('startSourceRun', () => {
  const { db, close } = createDb(url ?? 'postgres://x', { max: 2 });
  const key = `test-${randomUUID()}`;
  let sourceId: string;
  const startRun = vi.fn();
  const handler = startSourceRun({
    db,
    apify: { startRun },
    queue: { send: vi.fn() },
    log,
    maxItems: 7,
    maxChargeUsd: 0.5,
  });
  const run = () => handler({ id: 'j', data: { sourceId } });

  const setup = async (values: Partial<typeof source.$inferInsert> = {}) => {
    await db.delete(source).where(eq(source.key, key));
    [{ id: sourceId }] = (await db
      .insert(source)
      .values({
        key,
        name: 'Test',
        kind: 'event',
        baseUrl: 'https://example.com',
        apifyActorId: 'user/actor',
        inputTemplate: { startUrls: ['https://example.com'], maxResults: '{{maxItems}}' },
        cron: '0 * * * *',
        ...values,
      })
      .returning({ id: source.id })) as [{ id: string }];
  };

  beforeEach(() => {
    startRun.mockReset();
    startRun.mockResolvedValue({
      id: `run-${randomUUID()}`,
      status: 'READY',
      defaultDatasetId: 'ds1',
    });
  });
  afterAll(async () => {
    await db.delete(source).where(eq(source.key, key));
    await close();
  });

  it('fills the template, starts the run and records it', async () => {
    await setup();
    await run();
    expect(startRun).toHaveBeenCalledWith(
      'user/actor',
      { startUrls: ['https://example.com'], maxResults: 7 },
      { maxItems: 7, maxTotalChargeUsd: 0.5 },
    );
    const rows = await db.select().from(sourceRun).where(eq(sourceRun.sourceId, sourceId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'running', apifyDatasetId: 'ds1' });
  });

  it('fills lastRunAt only when the template uses it', async () => {
    await setup({ inputTemplate: { since: '{{lastRunAt}}' } });
    await run();
    const input = startRun.mock.calls[0]?.[1] as { since: string };
    expect(Number.isNaN(Date.parse(input.since))).toBe(false);
  });

  it('skips when a recent run is still running', async () => {
    await setup();
    await run();
    await run();
    expect(startRun).toHaveBeenCalledTimes(1);
  });

  it('skips disabled sources', async () => {
    await setup({ enabled: false });
    await run();
    expect(startRun).not.toHaveBeenCalled();
  });

  it('skips non-apify sources', async () => {
    await setup({ provider: 'mpsv_open_data', apifyActorId: null });
    await run();
    expect(startRun).not.toHaveBeenCalled();
  });

  it('rethrows Apify errors without recording a run', async () => {
    await setup();
    startRun.mockRejectedValue(new Error('boom'));
    await expect(run()).rejects.toThrow('boom');
    expect(await db.select().from(sourceRun).where(eq(sourceRun.sourceId, sourceId))).toHaveLength(
      0,
    );
  });
});
