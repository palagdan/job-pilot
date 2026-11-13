import { apiErrorSchema } from '@job-pilot/shared/errors';
import { messages } from '@job-pilot/shared/limits';
import { uploadSchema } from '@job-pilot/shared/upload';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fakePdf, textPretendingToBePdf } from '../test/fixtures.ts';
import { createTestApp, testDatabaseUrl } from '../test/test-app.ts';

/** Integration: real Postgres + Better Auth sessions + local-disk storage; the job queue records calls. */
describe.skipIf(!testDatabaseUrl)('uploads (integration)', () => {
  const t = createTestApp();
  let alice: Headers;
  let bob: Headers;

  beforeAll(async () => {
    await t.setup();
    alice = (await t.signIn()).headers;
    bob = (await t.signIn()).headers;
  });
  afterAll(() => t.teardown());

  const freshHeaders = async () => (await t.signIn()).headers;

  const post = (headers: Headers, bytes: Uint8Array, name = 'My CV.pdf', query = '') => {
    const form = new FormData();
    form.set(
      'file',
      new File([bytes as Uint8Array<ArrayBuffer>], name, { type: 'application/pdf' }),
    );
    return t.app.request(`/v1/uploads/cv${query}`, { method: 'POST', headers, body: form });
  };

  let firstId: string;

  it('POST /v1/uploads/cv → 201 pending upload, cv.parse enqueued', async () => {
    const res = await post(alice, fakePdf());
    expect(res.status).toBe(201);
    const body = uploadSchema.parse(await res.json());
    expect(body).toMatchObject({ filename: 'My CV.pdf', parseStatus: 'pending' });
    expect(t.jobs.parse).toContain(body.id);
    firstId = body.id;
  });

  it('GET /v1/uploads/:id returns the status to its owner only', async () => {
    expect((await t.app.request(`/v1/uploads/${firstId}`, { headers: alice })).status).toBe(200);
    expect((await t.app.request(`/v1/uploads/${firstId}`, { headers: bob })).status).toBe(404);
    expect((await t.app.request(`/v1/uploads/not-a-uuid`, { headers: alice })).status).toBe(400);
  });

  it('GET /v1/uploads/current returns the newest upload, or null when there is none', async () => {
    const mine = await t.app.request('/v1/uploads/current', { headers: alice });
    expect(mine.status).toBe(200);
    expect(uploadSchema.parse(await mine.json()).id).toBe(firstId);
    const none = await t.app.request('/v1/uploads/current', { headers: await freshHeaders() });
    expect(none.status).toBe(200);
    expect(await none.json()).toBeNull();
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
    const res = await t.app.request(`/v1/uploads/${firstId}/download`, { headers: alice });
    const { url: link, filename } = (await res.json()) as { url: string; filename: string };
    expect(filename).toBe('My CV.pdf');
    expect(link.startsWith('/v1/files/')).toBe(true);

    const file = await t.app.request(link, { headers: alice });
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('application/pdf');
    expect(file.headers.get('content-disposition')).toContain('My%20CV.pdf');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(fakePdf());

    expect((await t.app.request(link, { headers: bob })).status).toBe(404);
    expect((await t.app.request('/v1/files/users/../etc/passwd', { headers: alice })).status).toBe(
      404,
    );
  });
});
