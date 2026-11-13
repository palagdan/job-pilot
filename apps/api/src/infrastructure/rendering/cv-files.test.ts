import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixtureCv } from '@job-pilot/cv-render/fixture-cv';
import { cv, cvFile } from '@job-pilot/db/schema/cv';
import { createLocalFileStorage } from '@job-pilot/storage/local-file-storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getCvFile } from '../../application/cvs/get-cv-file.ts';
import { createTestApp, testDatabaseUrl } from '../../test/test-app.ts';
import { createDrizzleCvFileRepository } from '../repositories/drizzle-cv-file-repository.ts';
import { createCvRenderer } from './cv-render-adapter.ts';

/** Integration: real renderer (React-PDF / docx), cv_file in Postgres, local-disk storage. */
describe.skipIf(!testDatabaseUrl)('CV files (integration)', () => {
  const t = createTestApp();
  let dir: string;
  let cvId: string;
  let userId: string;

  beforeAll(async () => {
    await t.setup();
    ({ userId } = await t.signIn());
    const [row] = await t.db
      .insert(cv)
      .values({ userId, kind: 'master', version: 1, status: 'needs_review', content: fixtureCv })
      .returning({ id: cv.id });
    cvId = (row as { id: string }).id;
    dir = await mkdtemp(join(tmpdir(), 'jp-cv-files-'));
  });
  afterAll(async () => {
    await t.teardown();
    await rm(dir, { recursive: true, force: true });
  });

  it('renders PDF + DOCX once, records them in cv_file, serves the cache afterwards', {
    timeout: 30_000,
  }, async () => {
    const storage = createLocalFileStorage(dir);
    const deps = {
      renderer: createCvRenderer(),
      cvFiles: createDrizzleCvFileRepository(t.db),
      storage,
    };
    const target = {
      id: cvId,
      userId,
      content: fixtureCv,
      fileBaseName: 'Řehoř_Dvořák_CV_JobPilot_v1',
    };

    const pdf = await getCvFile(deps, target, 'pdf');
    expect(pdf).toMatchObject({ cached: false, pageCount: 1, contentType: 'application/pdf' });
    const stored = await storage.get(pdf.storageKey);
    expect(new TextDecoder().decode(stored?.body.slice(0, 5))).toBe('%PDF-');

    const docx = await getCvFile(deps, target, 'docx');
    expect(docx.filename).toBe('Řehoř_Dvořák_CV_JobPilot_v1.docx');

    expect((await getCvFile(deps, target, 'pdf')).cached).toBe(true);
    const rows = await t.db.select().from(cvFile).where(eq(cvFile.cvId, cvId));
    expect(rows.map((r) => r.format).sort()).toEqual(['docx', 'pdf']);
  });
});
