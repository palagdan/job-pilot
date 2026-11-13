import { createLogger, type Logger, silentLogger } from '@job-pilot/logger/logger';
import { AppError, apiErrorSchema, formatErrorCode } from '@job-pilot/shared/errors';
import { targetsSchema } from '@job-pilot/shared/targets';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import { describe, expect, it } from 'vitest';
import { createMemoryRateLimitStore } from '../infrastructure/rate-limit/memory-rate-limit-store.ts';
import type { AppEnv } from './app-env.ts';
import { createErrorHandler } from './error-handler.ts';
import { createRateLimit } from './middleware/rate-limit.ts';
import { createRequestLogger } from './middleware/request-logger.ts';
import { validate } from './validate.ts';

const captureLogger = () => {
  const lines: Record<string, unknown>[] = [];
  const log = createLogger({
    name: 'api',
    level: 'debug',
    pretty: false,
    destination: { write: (l) => void lines.push(JSON.parse(l)) },
  });
  return { lines, log };
};

const baseApp = (log: Logger = silentLogger) =>
  new Hono<AppEnv>()
    .use(requestId())
    .use(createRequestLogger(log))
    .onError(createErrorHandler(log));

const errorBody = async (res: Response) => apiErrorSchema.parse(await res.json()).error;

describe('error handler', () => {
  it('maps AppError to its code, status and fields', async () => {
    const app = baseApp().get('/x', () => {
      throw new AppError('agent_busy', 'The agent is busy with a run.');
    });
    const res = await app.request('/x');
    expect(res.status).toBe(409);
    expect(await errorBody(res)).toMatchObject({
      code: 'agent_busy',
      message: 'The agent is busy with a run.',
    });
  });

  it('maps Hono HTTPExceptions (e.g. body limit 413)', async () => {
    const app = baseApp().get('/x', () => {
      throw new HTTPException(413, { message: 'Too big' });
    });
    const res = await app.request('/x');
    expect(res.status).toBe(413);
    expect((await errorBody(res)).code).toBe('payload_too_large');
  });

  it('hides unexpected errors behind 500 internal, logs the stack with the request id', async () => {
    const { lines, log } = captureLogger();
    const app = baseApp(log).get('/x', () => {
      throw new Error('db exploded: password=hunter2');
    });
    const res = await app.request('/x');
    expect(res.status).toBe(500);
    const body = await errorBody(res);
    expect(body).toMatchObject({ code: 'internal', message: 'Something went wrong on our side.' });
    expect(JSON.stringify(body)).not.toContain('exploded');
    expect(formatErrorCode(500, body.requestId)).toMatch(/^JP-500-[0-9a-f-]{6}$/);

    const logged = lines.find((l) => l.msg === 'unhandled error') as {
      requestId: string;
      error: { stack: string };
    };
    expect(logged.requestId).toBe(body.requestId);
    expect(logged.error.stack).toContain('db exploded');
    expect(lines.find((l) => l.msg === 'request failed')).toMatchObject({
      status: 500,
      path: '/x',
    });
  });
});

describe('validate', () => {
  it('returns 400 validation_failed with per-field spec messages', async () => {
    const app = baseApp().post('/targets', validate('json', targetsSchema), (c) =>
      c.json(c.req.valid('json')),
    );
    const res = await app.request('/targets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        roles: [],
        locations: ['Prague'],
        workFormats: [],
        exclusions: [],
        findJobs: true,
        findEvents: true,
      }),
    });
    expect(res.status).toBe(400);
    const body = await errorBody(res);
    expect(body.code).toBe('validation_failed');
    expect(body.fields).toEqual({
      roles: 'Add at least one target role.',
      workFormats: 'Select at least one work format.',
    });
  });

  it('passes parsed (transformed) data to the handler', async () => {
    const app = baseApp().post('/targets', validate('json', targetsSchema), (c) =>
      c.json(c.req.valid('json')),
    );
    const res = await app.request('/targets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        roles: ['CMO', 'cmo'],
        locations: ['Prague'],
        workFormats: ['remote'],
        exclusions: [],
        findJobs: true,
        findEvents: false,
      }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { roles: string[] }).roles).toEqual(['CMO']);
  });
});

describe('rate limit', () => {
  it('allows `max` requests per window, then 429 with Retry-After; separate per IP; resets', async () => {
    let now = 1_000_000;
    const store = createMemoryRateLimitStore(() => now);
    const app = baseApp()
      .use(createRateLimit(store, { name: 't', max: 2, windowMs: 60_000, by: 'ip' }))
      .get('/x', (c) => c.text('ok'));
    const from = (ip: string) => app.request('/x', { headers: { 'x-forwarded-for': ip } });

    expect((await from('1.1.1.1')).status).toBe(200);
    const second = await from('1.1.1.1');
    expect(second.headers.get('RateLimit-Remaining')).toBe('0');
    const third = await from('1.1.1.1');
    expect(third.status).toBe(429);
    expect((await errorBody(third)).code).toBe('rate_limited');
    expect(third.headers.get('Retry-After')).not.toBeNull();
    expect((await from('2.2.2.2')).status).toBe(200);

    now += 60_000;
    expect((await from('1.1.1.1')).status).toBe(200);
    store.stop();
  });
});

describe('request logger', () => {
  it('logs one line per request with status, duration and request id', async () => {
    const { lines, log } = captureLogger();
    const app = baseApp(log).get('/x', (c) => {
      c.var.log.info('inside handler');
      return c.text('ok');
    });
    const res = await app.request('/x');
    const id = res.headers.get('x-request-id');
    expect(lines.find((l) => l.msg === 'inside handler')).toMatchObject({ requestId: id });
    expect(lines.find((l) => l.msg === 'request')).toMatchObject({
      requestId: id,
      method: 'GET',
      path: '/x',
      status: 200,
    });
  });
});
