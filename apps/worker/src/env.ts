import { parseEnv } from '@job-pilot/config/env';
import { baseEnv, databaseEnv } from '@job-pilot/config/fragments';
import { z } from 'zod';

export const env = parseEnv({
  ...baseEnv,
  ...databaseEnv,
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(4),
});
