import { parseEnv } from '@job-pilot/config/env';
import { authEnv, baseEnv, databaseEnv, pushEnv, storageEnv } from '@job-pilot/config/fragments';
import { z } from 'zod';

export const env = parseEnv({
  ...baseEnv,
  ...databaseEnv,
  ...authEnv,
  ...storageEnv,
  ...pushEnv,
  PORT: z.coerce.number().int().default(3001),
  /** Comma-separated emails that may open the ops view (/v1/admin/ops). */
  ADMIN_EMAILS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
});
export type Env = typeof env;
