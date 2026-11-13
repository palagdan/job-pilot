import { z } from 'zod';

/** Env shapes to spread into `parseEnv({ ...baseEnv, ...databaseEnv, ... })`. */
export const baseEnv = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
};

export const databaseEnv = {
  DATABASE_URL: z.union([
    z.url(),
    z.string().regex(/^postgres(ql)?:\/\//, 'Must be a postgres:// or postgresql:// URL'),
  ]),
};

export const llmEnv = {
  FEATHERLESS_API_KEY: z.string().min(1),
  FEATHERLESS_BASE_URL: z.url().default('https://api.featherless.ai/v1'),
  LLM_CONCURRENCY_UNITS: z.coerce.number().int().min(1).default(4),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1).default(60000),
};
