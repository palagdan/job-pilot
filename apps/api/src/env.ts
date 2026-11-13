import { parseEnv } from '@job-pilot/config/env';
import { authEnv, baseEnv, databaseEnv, storageEnv } from '@job-pilot/config/fragments';
import { z } from 'zod';

export const env = parseEnv({
  ...baseEnv,
  ...databaseEnv,
  ...authEnv,
  ...storageEnv,
  PORT: z.coerce.number().int().default(3001),
});
export type Env = typeof env;
