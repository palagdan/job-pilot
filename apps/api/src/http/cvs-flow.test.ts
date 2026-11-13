import { fixtureCv } from '@job-pilot/cv-render/fixture-cv';
import { cv, upload } from '@job-pilot/db/schema/cv';
import { profile } from '@job-pilot/db/schema/profile';
import { cvListSchema, cvSchema, downloadSchema } from '@job-pilot/shared/cv';
import { apiErrorSchema } from '@job-pilot/shared/errors';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fakePdf } from '../test/fixtures.ts';
import { createTestApp, testDatabaseUrl } from '../test/test-app.ts';

/**
 * Integration: the CV lifecycle on Postgres with the real renderer. The worker's master-CV job is simulated by
 * inserting master rows (what cv.generate-master writes).
 */
describe.skipIf(!testDatabaseUrl)('CVs (integration)', () => {
  const t = createTestApp({ now: () => new Date('2026-11-13T10:00:00Z') });
  let h: Headers;
  let userId: string;
  let uploadId: string;

  const call = (method: string, path: string, body?: unknown) =>
    t.app.request(path, {
      method,
      headers:
        body === undefined
          ? h
          : { cookie: h.get('cookie') ?? '', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const list = async () => cvListSchema.parse(await (await call('GET', '/v1/cvs')).json());
  const insertMaster = async (
    version: number,
    status: 'needs_review' | 'generating' = 'needs_review',
  ) => {
    const [row] = await t.db
      .insert(cv)
      .values({
        userId,
        kind: 'master',
        version,
        status,
        content: status === 'generating' ? null : fixtureCv,
        changes: ['Headline rewritten for your target roles'],
        uploadId,
      })
      .returning({ id: cv.id });
    return (row as { id: string }).id;
  };

  beforeAll(async () => {
    await t.setup();
    ({ headers: h, userId } = await t.signIn({ name: 'Account Name' }));
    const form = new FormData();
    form.set('file', new File([fakePdf() as Uint8Array<ArrayBuffer>], 'my_cv.pdf'));
    const up = await t.app.request('/v1/uploads/cv', { method: 'POST', headers: h, body: form });
    uploadId = ((await up.json()) as { id: string }).id;
    await t.db
      .update(upload)
      .set({ parseStatus: 'parsed', parsedContent: { ...fixtureCv, summary: 'Original summary' } })
      .where(eq(upload.id, uploadId));
    await t.db.insert(profile).values({ userId, fullName: 'Řehoř Dvořák' });
  });
  afterAll(() => t.teardown());

  let v1: string;
  let v2: string;

  it('lists the generated master (needs review) with the spec file name and the original upload', async () => {
    v1 = await insertMaster(1);
    const cvs = await list();
    expect(cvs.master).toMatchObject({
      id: v1,
      status: 'needs_review',
      fileBaseName: 'Řehoř_Dvořák_CV_JobPilot_v1',
      changes: ['Headline rewritten for your target roles'],
    });
    expect(cvs.original).toEqual({ uploadId, filename: 'my_cv.pdf' });
    expect(cvs.special).toEqual([]);
  });

  it('C02 confirm: needs review → confirmed; idempotent', async () => {
    const res = await call('POST', `/v1/cvs/${v1}/confirm`);
    expect(cvSchema.parse(await res.json())).toMatchObject({
      status: 'confirmed',
      confirmedAt: '2026-11-13T10:00:00.000Z',
    });
    expect((await call('POST', `/v1/cvs/${v1}/confirm`)).status).toBe(200);
  });

  it('C05: the confirmed master cannot be deleted', async () => {
    const res = await call('DELETE', `/v1/cvs/${v1}`);
    expect(res.status).toBe(409);
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('conflict');
  });

  it('regenerate queues the worker; confirming the new version supersedes the old one', async () => {
    expect((await call('POST', `/v1/cvs/${v1}/regenerate`)).status).toBe(200);
    expect(t.jobs.generateMaster.at(-1)).toEqual({ userId, uploadId });

    v2 = await insertMaster(2);
    expect((await list()).master?.id).toBe(v2); // newest version shown (awaiting review)
    await call('POST', `/v1/cvs/${v2}/confirm`);
    const [old] = await t.db
      .select({ supersededAt: cv.supersededAt })
      .from(cv)
      .where(eq(cv.id, v1));
    expect(old?.supersededAt).not.toBeNull();
    expect((await call('DELETE', `/v1/cvs/${v1}`)).status).toBe(200); // superseded versions can be deleted
  });

  it('C03 keep original: new confirmed master from the uploaded text', async () => {
    const res = await call('POST', '/v1/cvs/keep-original');
    const kept = cvSchema.parse(await res.json());
    expect(kept).toMatchObject({
      origin: 'original',
      status: 'confirmed',
      version: 3,
      changes: [],
    });
    expect(kept.content?.summary).toBe('Original summary');
    expect((await list()).master?.id).toBe(kept.id);
  });

  it('edit text validates the structured content and resets the page count', async () => {
    const { master } = await list();
    const res = await call('PUT', `/v1/cvs/${master?.id}/content`, {
      content: { ...fixtureCv, summary: 'Edited by me' },
    });
    expect(cvSchema.parse(await res.json()).content?.summary).toBe('Edited by me');
    expect(
      (
        await call('PUT', `/v1/cvs/${master?.id}/content`, {
          content: { summary: 'missing fields' },
        })
      ).status,
    ).toBe(400);
  });

  it('download renders a real PDF once, stores the page count, serves a signed link', {
    timeout: 30_000,
  }, async () => {
    const { master } = await list();
    const res = await call('GET', `/v1/cvs/${master?.id}/download?format=pdf`);
    const { url, filename } = downloadSchema.parse(await res.json());
    expect(filename).toBe('Řehoř_Dvořák_CV_JobPilot_v3.pdf');
    const file = await t.app.request(url, { headers: h });
    expect(file.headers.get('content-type')).toBe('application/pdf');
    expect(new TextDecoder().decode(new Uint8Array(await file.arrayBuffer()).slice(0, 5))).toBe(
      '%PDF-',
    );
    expect((await list()).master?.pageCount).toBe(1);

    const docx = downloadSchema.parse(
      await (await call('GET', `/v1/cvs/${master?.id}/download?format=docx`)).json(),
    );
    expect(docx.filename.endsWith('.docx')).toBe(true);
  });

  it('compare: master vs the original upload', async () => {
    const { master } = await list();
    const res = await call('GET', `/v1/cvs/${master?.id}/compare`);
    const body = (await res.json()) as {
      base: { origin: string; content: { summary: string } };
      other: { content: { summary: string } };
    };
    expect(body.base).toMatchObject({
      origin: 'original',
      content: { summary: 'Original summary' },
    });
    expect(body.other.content.summary).toBe('Edited by me');
  });

  it('a CV still being written cannot be edited or downloaded', async () => {
    const generating = await insertMaster(4, 'generating');
    expect(
      (await call('PUT', `/v1/cvs/${generating}/content`, { content: fixtureCv })).status,
    ).toBe(409);
    expect((await call('GET', `/v1/cvs/${generating}/download?format=pdf`)).status).toBe(409);
  });

  it("other users cannot see or touch someone else's CV", async () => {
    const other = await t.signIn();
    const { master } = await list();
    for (const [method, path] of [
      ['GET', `/v1/cvs/${master?.id}`],
      ['POST', `/v1/cvs/${master?.id}/confirm`],
      ['DELETE', `/v1/cvs/${master?.id}`],
      ['GET', `/v1/cvs/${master?.id}/download?format=pdf`],
    ] as const) {
      expect((await t.app.request(path, { method, headers: other.headers })).status).toBe(404);
    }
  });
});
