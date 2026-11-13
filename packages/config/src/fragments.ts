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

/**
 * File storage. `local` (default) keeps files on disk, for development without S3; `s3` is any
 * S3-compatible store (RustFS locally, R2/S3 in production) and needs the S3_* vars.
 */
export const storageEnv = {
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  /** Relative paths resolve from the app directory (apps/api, apps/worker), so both share one folder. */
  LOCAL_STORAGE_DIR: z.string().min(1).default('../../.cache/storage'),
  /** Omit for AWS S3; required for RustFS/R2. */
  S3_ENDPOINT: optionalString.pipe(z.url().optional()),
  /** Endpoint the browser uses for signed URLs, if different from S3_ENDPOINT (e.g. api in docker). */
  S3_PUBLIC_ENDPOINT: optionalString.pipe(z.url().optional()),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  /** true for RustFS/MinIO-style servers. */
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),
};
