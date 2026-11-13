import { fixtureCv } from '@job-pilot/cv-render/fixture-cv';
import { AppError } from '@job-pilot/shared/errors';
import { createMemoryFileStorage } from '@job-pilot/storage/memory-file-storage';
import { describe, expect, it } from 'vitest';
import type { CvFileRecord, CvFileRepository } from '../ports/cv-file-repository.ts';
import type { CvRenderer } from '../ports/cv-renderer.ts';
import { getCvFile } from './get-cv-file.ts';

const setup = () => {
  const renders: string[] = [];
  const renderer: CvRenderer = {
    render: async (content, format) => {
      renders.push(`${format}:${content.summary}`);
      return {
        bytes: new TextEncoder().encode(`${format}:${content.summary}`),
        pageCount: format === 'pdf' ? 1 : null,
      };
    },
    cacheKey: (content) => `h-${content.summary.length}`,
    contentType: (format) => (format === 'pdf' ? 'application/pdf' : 'application/docx'),
  };
  const rows: CvFileRecord[] = [];
  const cvFiles: CvFileRepository = {
    find: async (cvId, format, hash) =>
      rows.find((r) => r.cvId === cvId && r.format === format && r.contentHash === hash) ?? null,
    save: async (r) => void rows.push(r),
  };
  const storage = createMemoryFileStorage();
  return { deps: { renderer, cvFiles, storage }, renders, rows, storage };
};

const cv = {
  id: 'cv-1',
  userId: 'u-1',
  content: fixtureCv,
  fileBaseName: 'Řehoř_Dvořák_CV_JobPilot_v1',
};

describe('getCvFile', () => {
  it('renders once per content and format, then serves from cache', async () => {
    const { deps, renders, rows, storage } = setup();
    const first = await getCvFile(deps, cv, 'pdf');
    expect(first).toMatchObject({
      filename: 'Řehoř_Dvořák_CV_JobPilot_v1.pdf',
      contentType: 'application/pdf',
      pageCount: 1,
      cached: false,
    });
    expect(first.storageKey).toBe(`users/u-1/cvs/cv-1/h-${fixtureCv.summary.length}.pdf`);
    expect(storage.files.has(first.storageKey)).toBe(true);

    const again = await getCvFile(deps, cv, 'pdf');
    expect(again).toMatchObject({ storageKey: first.storageKey, cached: true });
    expect(renders).toHaveLength(1);

    await getCvFile(deps, cv, 'docx');
    expect(renders).toHaveLength(2);
    expect(rows).toHaveLength(2);
  });

  it('renders again after the content changes (edit text)', async () => {
    const { deps, renders } = setup();
    const a = await getCvFile(deps, cv, 'pdf');
    const b = await getCvFile(deps, { ...cv, content: { ...fixtureCv, summary: 'Short' } }, 'pdf');
    expect(b.storageKey).not.toBe(a.storageKey);
    expect(renders).toHaveLength(2);
  });

  it('re-renders when the cached file is missing from storage', async () => {
    const { deps, renders, storage } = setup();
    const a = await getCvFile(deps, cv, 'pdf');
    await storage.delete(a.storageKey);
    expect((await getCvFile(deps, cv, 'pdf')).cached).toBe(false);
    expect(renders).toHaveLength(2);
  });

  it('refuses a CV that is still being written', async () => {
    const { deps } = setup();
    const error = await getCvFile(deps, { ...cv, content: null }, 'pdf').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('conflict');
  });
});
