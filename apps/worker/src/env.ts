import { parseEnv } from '@job-pilot/config/env';
import {
  apifyEnv,
  baseEnv,
  databaseEnv,
  emailEnv,
  llmEnv,
  storageEnv,
} from '@job-pilot/config/fragments';
import { z } from 'zod';

export const env = parseEnv({
  ...baseEnv,
  ...databaseEnv,
  ...llmEnv,
  ...storageEnv,
  ...apifyEnv,
  ...emailEnv,
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(4),
});
