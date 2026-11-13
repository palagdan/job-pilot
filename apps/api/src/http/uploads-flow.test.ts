import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb } from '@job-pilot/db/client';
import { runMigrations } from '@job-pilot/db/migrator';
import { user } from '@job-pilot/db/schema/auth';
import { silentLogger } from '@job-pilot/logger/logger';
import { apiErrorSchema } from '@job-pilot/shared/errors';
import { messages } from '@job-pilot/shared/limits';
import { uploadSchema } from '@job-pilot/shared/upload';
import { createLocalFileStorage } from '@job-pilot/storage/local-file-storage';
import { betterAuth } from 'better-auth';
import { testUtils } from 'better-auth/plugins';
import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createAuthOptions, createSessionReader } from '../infrastructure/auth/better-auth.ts';
import { createMemoryRateLimitStore } from '../infrastructure/rate-limit/memory-rate-limit-store.ts';
import { createDrizzleUploadRepository } from '../infrastructure/repositories/drizzle-upload-repository.ts';
import { createDrizzleUserRepository } from '../infrastructure/repositories/drizzle-user-repository.ts';
import { fakePdf, textPretendingToBePdf } from '../test/fixtures.ts';
import { authBasePath } from './paths.ts';

/** Integration: real Postgres + Better Auth sessions + local-disk storage; the job queue is a recorder. */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('uploads (integration)', () => {
  const { db, close } = createDb(url ?? 'postgres://unused', { max: 2 });
  const env = {
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
    WEB_URL: 'http://localhost:3000',
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
  };
  const auth = betterAuth({
    ...createAuthOptions({ db, env, basePath: authBasePath }),
    plugins: [testUtils()],
  });
  const enqueued: string[] = [];
  const emails = [`up-a-${Date.now()}@example.com`, `up-b-${Date.now()}@example.com`];
  let dir: string;
  let app: ReturnType<typeof createApp>;
  let alice: Headers;
  let bob: Headers;

  beforeAll(async () => {
    await runMigrations(url as string);
    dir = await mkdtemp(join(tmpdir(), 'jp-uploads-'));
    app = createApp({
      log: silentLogger,
      rateLimitStore: createMemoryRateLimitStore(),
      authHandler: auth.handler,
      sessions: createSessionReader(auth),
      users: createDrizzleUserRepository(db),
      uploads: createDrizzleUploadRepository(db),
      storage: createLocalFileStorage(dir),
      jobs: { enqueueCvParse: async (id) => void enqueued.push(id) },
    });
    const test = (await auth.$context).test;
    const [a, b] = await Promise.all(
      emails.map((email) => test.saveUser(test.createUser({ email, name: email }))),
    );
    alice = (await test.login({ userId: (a as { id: string }).id })).headers;
    bob = (await test.login({ userId: (b as { id: string }).id })).headers;
  });

  afterAll(async () => {
    await db.delete(user).where(inArray(user.email, emails)); // cascades to uploads
    await close();
    await rm(dir, { recursive: true, force: true });
  });

  const post = (headers: Headers, bytes: Uint8Array, name = 'My CV.pdf', query = '') => {
    const form = new FormData();
    form.set(
      'file',
      new File([bytes as Uint8Array<ArrayBuffer>], name, { type: 'application/pdf' }),
    );
    return app.request(`/v1/uploads/cv${query}`, { method: 'POST', headers, body: form });
  };

  let firstId: string;

  it('POST /v1/uploads/cv → 201 pending upload, cv.parse enqueued', async () => {
    const res = await post(alice, fakePdf());
    expect(res.status).toBe(201);
    const body = uploadSchema.parse(await res.json());
    expect(body).toMatchObject({ filename: 'My CV.pdf', parseStatus: 'pending' });
    expect(enqueued).toContain(body.id);
    firstId = body.id;
  });

  it('GET /v1/uploads/:id returns the status to its owner only', async () => {
    expect((await app.request(`/v1/uploads/${firstId}`, { headers: alice })).status).toBe(200);
    expect((await app.request(`/v1/uploads/${firstId}`, { headers: bob })).status).toBe(404);
    expect((await app.request(`/v1/uploads/not-a-uuid`, { headers: alice })).status).toBe(400);
  });

  it('second CV without replace → 409; with ?replace=true → 201', async () => {
    expect((await post(alice, fakePdf())).status).toBe(409);
    expect((await post(alice, fakePdf(), 'v2.pdf', '?replace=true')).status).toBe(201);
  });

  it('rejects a renamed text file with 415 and the spec copy', async () => {
    const res = await post(bob, textPretendingToBePdf());
    expect(res.status).toBe(415);
    expect(apiErrorSchema.parse(await res.json()).error.message).toBe(messages.cvWrongType);
  });

  it('rejects files over 5 MB with 413', async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 200 * 1024);
    big.set(fakePdf());
    const res = await post(bob, big);
    expect(res.status).toBe(413);
    expect(apiErrorSchema.parse(await res.json()).error.message).toBe(messages.cvTooLarge);
  });

  it('requires a session', async () => {
    expect((await post(new Headers(), fakePdf())).status).toBe(401);
  });

  it('download link (local mode) serves the original to its owner, never to others', async () => {
    const res = await app.request(`/v1/uploads/${firstId}/download`, { headers: alice });
    const { url: link, filename } = (await res.json()) as { url: string; filename: string };
    expect(filename).toBe('My CV.pdf');
    expect(link.startsWith('/v1/files/')).toBe(true);

    const file = await app.request(link, { headers: alice });
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('application/pdf');
    expect(file.headers.get('content-disposition')).toContain('My%20CV.pdf');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(fakePdf());

    expect((await app.request(link, { headers: bob })).status).toBe(404);
    expect((await app.request('/v1/files/users/../etc/passwd', { headers: alice })).status).toBe(
      404,
    );
  });
});
