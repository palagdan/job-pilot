import { createLogger, type Logger } from '@job-pilot/logger/logger';
import { env } from './env.ts';

/** Shared pino logger (`@job-pilot/logger`). Pretty output in development, JSON lines otherwise. */
export const log = createLogger({ name: 'worker', level: env.LOG_LEVEL });

export type Log = Logger;
