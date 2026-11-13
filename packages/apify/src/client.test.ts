import { describe, expect, it, vi } from 'vitest';
import { ApifyError, createApifyClient } from './client.ts';

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

describe('apify client', () => {
  it('starts a run with query, body and auth header', async () => {
    const fetchFn = vi.fn(async () =>
      json({ data: { id: 'r1', status: 'READY', defaultDatasetId: 'd1', startedAt: 'x' } }),
    );
    const client = createApifyClient({ token: 'tok', fetch: fetchFn as never });
    const run = await client.startRun(
      'user/actor',
      { a: 1 },
      { maxItems: 5, maxTotalChargeUsd: 0.5, timeoutSecs: 60 },
    );
    expect(run.id).toBe('r1');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://api.apify.com/v2/acts/user~actor/runs?maxItems=5&maxTotalChargeUsd=0.5&timeout=60',
    );
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  it('maps non-2xx responses to ApifyError', async () => {
    const fetchFn = vi.fn(async () =>
      json({ error: { type: 'x', message: 'Token invalid' } }, { status: 401 }),
    );
    const client = createApifyClient({ token: 't', fetch: fetchFn as never });
    const error = await client.getRun('r1').catch((e) => e);
    expect(error).toBeInstanceOf(ApifyError);
    expect(error).toMatchObject({ status: 401, message: 'Token invalid' });
  });

  it('reads dataset items with total and item count', async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.includes('/items')
        ? json([{ a: 1 }], { headers: { 'x-apify-pagination-total': '42' } })
        : json({ data: { itemCount: 7 } }),
    );
    const client = createApifyClient({ token: 't', fetch: fetchFn as never });
    expect(await client.getDatasetItems('d1', { offset: 0, limit: 1 })).toEqual({
      items: [{ a: 1 }],
      total: 42,
    });
    expect(await client.getDatasetItemCount('d1')).toBe(7);
  });
});
