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
