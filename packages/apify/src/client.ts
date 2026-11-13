import { z } from 'zod';

export class ApifyError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApifyError';
    this.status = status;
  }
}

export type ApifyClientConfig = { token: string; baseUrl?: string; fetch?: typeof fetch };

export type StartRunOptions = { maxItems: number; maxTotalChargeUsd: number; timeoutSecs?: number };

const runSchema = z.object({
  id: z.string(),
  status: z.string(),
  defaultDatasetId: z.string().nullish(),
  startedAt: z.string().nullish(),
  finishedAt: z.string().nullish(),
  statusMessage: z.string().nullish(),
  usageTotalUsd: z.number().nullish(),
});
export type ApifyRun = z.infer<typeof runSchema>;

const runEnvelope = z.object({ data: runSchema });
const datasetEnvelope = z.object({ data: z.object({ itemCount: z.number() }) });

export const createApifyClient = ({
  token,
  baseUrl = 'https://api.apify.com/v2',
  fetch: fetchFn = fetch,
}: ApifyClientConfig) => {
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetchFn(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${token}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
    });
    if (!response.ok) {
      let message = response.statusText || `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as { error?: { message?: string } };
        if (body.error?.message) message = body.error.message;
      } catch {
        // non-JSON error body: keep the status text
      }
      throw new ApifyError(response.status, message);
    }
    return response;
  };

  return {
    async startRun(actorId: string, input: unknown, options: StartRunOptions) {
      const query = new URLSearchParams({
        maxItems: String(options.maxItems),
        maxTotalChargeUsd: String(options.maxTotalChargeUsd),
      });
      if (options.timeoutSecs) query.set('timeout', String(options.timeoutSecs));
      const response = await request(`/acts/${actorId.replace('/', '~')}/runs?${query}`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return runEnvelope.parse(await response.json()).data;
    },

    async getRun(runId: string) {
      const response = await request(`/actor-runs/${encodeURIComponent(runId)}`);
      return runEnvelope.parse(await response.json()).data;
    },

    async getDatasetItems(datasetId: string, { offset, limit }: { offset: number; limit: number }) {
      const query = new URLSearchParams({
        clean: '1',
        format: 'json',
        offset: String(offset),
        limit: String(limit),
      });
      const response = await request(`/datasets/${encodeURIComponent(datasetId)}/items?${query}`);
      const items = z.array(z.unknown()).parse(await response.json());
      const total = Number(response.headers.get('x-apify-pagination-total') ?? items.length);
      return { items, total };
    },

    async getDatasetItemCount(datasetId: string) {
      const response = await request(`/datasets/${encodeURIComponent(datasetId)}`);
      return datasetEnvelope.parse(await response.json()).data.itemCount;
    },
  };
};

export type ApifyClient = ReturnType<typeof createApifyClient>;
