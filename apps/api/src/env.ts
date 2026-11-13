import { parseEnv } from '@job-pilot/config/env';
import { baseEnv } from '@job-pilot/config/fragments';
import { z } from 'zod';

export const env = parseEnv({ ...baseEnv, PORT: z.coerce.number().int().default(3001) });
