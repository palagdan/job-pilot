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

/** Empty strings in .env (`KEY=`) count as "not set". */
const optionalString = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().min(1).optional(),
);

export const authEnv = {
  /** Signs session cookies. Generate with `openssl rand -base64 32`. */
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, 'Must be at least 32 characters (openssl rand -base64 32)'),
  /**
   * Public origin of the web app. The browser reaches the api through it (Next rewrites `/api/auth/*` and `/v1/*`),
   * so session cookies are first-party and the Google redirect URI is `${WEB_URL}/api/auth/callback/google`.
   */
  WEB_URL: z.url().default('http://localhost:3000'),
  /** Optional locally: without them the api starts but Google sign-in is disabled. */
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
};

export const llmEnv = {
  FEATHERLESS_API_KEY: z.string().min(1),
  FEATHERLESS_BASE_URL: z.url().default('https://api.featherless.ai/v1'),
  LLM_CONCURRENCY_UNITS: z.coerce.number().int().min(1).default(4),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1).default(60000),
};
