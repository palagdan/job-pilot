import { env } from './env.ts';

const levels = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof levels;
type Fields = Record<string, unknown>;

const write = (level: Level, msg: string, fields?: Fields) => {
  if (levels[level] < levels[env.LOG_LEVEL]) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields });
  (level === 'error' ? console.error : console.log)(line);
};

/** Placeholder until the shared pino logger lands. */
export const log = {
  debug: (msg: string, fields?: Fields) => write('debug', msg, fields),
  info: (msg: string, fields?: Fields) => write('info', msg, fields),
  warn: (msg: string, fields?: Fields) => write('warn', msg, fields),
  error: (msg: string, fields?: Fields) => write('error', msg, fields),
};

export type Log = typeof log;
