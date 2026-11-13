import { apiErrorSchema } from '@job-pilot/shared/errors';
import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import { describe, expect, it } from 'vitest';
import type { SessionReader } from '../../application/ports/session-reader.ts';
import type { AppEnv } from '../app-env.ts';
import { createRequireUser } from './require-user.ts';

const user = { id: '0b6e2f1e-6c43-4a8e-9a39-0d3b5b0c2a11', email: 'a@example.com', name: 'A' };

const buildApp = (sessions: SessionReader) =>
  new Hono<AppEnv>()
    .use(requestId())
    .use(createRequireUser(sessions))
    .get('/whoami', (c) => c.json({ id: c.var.user.id }));

describe('requireUser', () => {
  it('returns 401 in the shared error shape when there is no session', async () => {
    const res = await buildApp({ read: async () => null }).request('/whoami');
    expect(res.status).toBe(401);
    const body = apiErrorSchema.parse(await res.json());
    expect(body.error.code).toBe('unauthorized');
    expect(body.error.requestId).toBe(res.headers.get('x-request-id'));
  });

  it('passes the request headers to the session reader and exposes the user', async () => {
    let seenCookie: string | null = null;
    const app = buildApp({
      read: async (headers) => {
        seenCookie = headers.get('cookie');
        return user;
      },
    });
    const res = await app.request('/whoami', { headers: { cookie: 'session=abc' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: user.id });
    expect(seenCookie).toBe('session=abc');
  });
});
