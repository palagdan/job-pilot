import type { llmEnv } from '@job-pilot/config/fragments';
import type { z } from 'zod';
import { createLlm, type UsageRecord } from './client.ts';
import { resolveModels } from './models.ts';

type LlmEnv = z.infer<z.ZodObject<typeof llmEnv>>;

export const createLlmFromEnv = (
  env: LlmEnv,
  { recordUsage }: { recordUsage?: (u: UsageRecord) => Promise<void> | void } = {},
) =>
  createLlm({
    apiKey: env.FEATHERLESS_API_KEY,
    baseURL: env.FEATHERLESS_BASE_URL,
    concurrencyUnits: env.LLM_CONCURRENCY_UNITS,
    timeoutMs: env.LLM_TIMEOUT_MS,
    models: resolveModels(process.env),
    ...(recordUsage ? { recordUsage } : {}),
  });
