import { parseEnv } from '@job-pilot/config/env';
import {
  apifyEnv,
  baseEnv,
  databaseEnv,
  emailEnv,
  llmEnv,
  pushEnv,
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
  ...pushEnv,
  AGENT_MAX_CANDIDATES: z.coerce.number().int().min(1).max(200).default(25),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(4),
});
