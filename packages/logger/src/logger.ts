import pino from 'pino';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

/**
 * Logging port. Application code depends on this type only; the pino adapter below is wired in by each app's
 * composition root. Call shape: `log.info('message', { field: value })`.
 */
export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** Logger that adds `bindings` to every line (e.g. `{ requestId }`, `{ job, jobId }`). */
  child(bindings: LogFields): Logger;
}

export type LoggerOptions = {
  /** Service name on every line: "api", "worker". */
  name: string;
  level: LogLevel;
  /** Human-readable output (pino-pretty). Default: on in development, JSON lines otherwise. */
  pretty?: boolean;
  /** Where JSON lines go (default stdout). Ignored when `pretty`. Used by tests. */
  destination?: { write(line: string): void };
};

/** Field names whose values are never logged. */
const redactPaths = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'secret',
  'authorization',
  'cookie',
  '*.password',
  '*.token',
  '*.authorization',
  '*.cookie',
  'headers.authorization',
  'headers.cookie',
];

const wrap = (p: pino.Logger): Logger => ({
  debug: (msg, fields) => p.debug(fields ?? {}, msg),
  info: (msg, fields) => p.info(fields ?? {}, msg),
  warn: (msg, fields) => p.warn(fields ?? {}, msg),
  error: (msg, fields) => p.error(fields ?? {}, msg),
  child: (bindings) => wrap(p.child(bindings)),
});

export const createLogger = ({ name, level, pretty, destination }: LoggerOptions): Logger => {
  const usePretty = pretty ?? process.env.NODE_ENV === 'development';
  const options: pino.LoggerOptions = {
    name,
    level,
    redact: { paths: redactPaths, censor: '[redacted]' },
    // `err` / `error` fields with an Error get message + stack.
    serializers: { err: pino.stdSerializers.err, error: pino.stdSerializers.err },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  if (usePretty) {
    return wrap(
      pino({
        ...options,
        transport: {
          target: 'pino-pretty',
          options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l' },
        },
      }),
    );
  }
  return wrap(destination ? pino(options, destination) : pino(options));
};

/** Discards everything. For tests and scripts. */
export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger,
};
