import { silentLogger } from '@job-pilot/logger/logger';
import { AppError } from '@job-pilot/shared/errors';
import { limits, messages } from '@job-pilot/shared/limits';
import { createMemoryFileStorage } from '@job-pilot/storage/memory-file-storage';
import { describe, expect, it } from 'vitest';
import { fakeDocx, fakePdf, textPretendingToBePdf } from '../../test/fixtures.ts';
import type { UploadRecord, UploadRepository } from '../ports/upload-repository.ts';
import { getOriginalDownload, getUpload } from './get-upload.ts';
import { uploadCv } from './upload-cv.ts';

const userId = '11111111-1111-4111-8111-111111111111';

const setup = () => {
  const rows: UploadRecord[] = [];
  const uploads: UploadRepository = {
    findCurrentCv: async (uid) =>
      rows.filter((r) => r.userId === uid && !r.replacedAt).at(-1) ?? null,
    findOwned: async (id, uid) => rows.find((r) => r.id === id && r.userId === uid) ?? null,
    create: async (input, { replacePrevious }) => {
      if (replacePrevious)
        for (const r of rows)
          if (r.userId === input.userId && !r.replacedAt) r.replacedAt = new Date();
      const row: UploadRecord = {
        ...input,
        pageCount: null,
        parseStatus: 'pending',
        parseError: null,
        parsedContent: null,
        replacedAt: null,
        createdAt: new Date(),
      };
      rows.push(row);
      return row;
    },
  };
  const enqueued: string[] = [];
  const storage = createMemoryFileStorage();
  let n = 0;
  const deps = {
    uploads,
    storage,
    jobs: {
      enqueueCvParse: async (id: string) => void enqueued.push(id),
      enqueueGenerateMasterCv: async () => {},
    },
    log: silentLogger,
    newId: () => `00000000-0000-4000-8000-00000000000${++n}`,
  };
  return { deps, rows, enqueued, storage };
};

const expectAppError = async (promise: Promise<unknown>, code: string, message?: string) => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  if (message) expect((error as AppError).message).toBe(message);
};

describe('uploadCv', () => {
  it('stores the original, records it as pending and enqueues cv.parse', async () => {
    const { deps, rows, enqueued, storage } = setup();
    const result = await uploadCv(deps, {
      userId,
      filename: 'My CV.pdf',
      bytes: fakePdf(),
      replace: false,
    });

    expect(result).toMatchObject({
      filename: 'My CV.pdf',
      parseStatus: 'pending',
      parseError: null,
      pageCount: null,
    });
    const key = `users/${userId}/uploads/${result.id}.pdf`;
    expect(rows[0]).toMatchObject({ storageKey: key, mimeType: 'application/pdf' });
    expect(storage.files.get(key)?.contentType).toBe('application/pdf');
    expect(enqueued).toEqual([result.id]);
  });

  it('uses the detected type, not the file name', async () => {
    const { deps, rows } = setup();
    await uploadCv(deps, { userId, filename: 'cv.pdf', bytes: fakeDocx(), replace: false });
    expect(rows[0]?.storageKey).toMatch(/\.docx$/);
  });

  it('rejects wrong types, empty and oversized files with the spec copy', async () => {
    const { deps, enqueued } = setup();
    await expectAppError(
      uploadCv(deps, {
        userId,
        filename: 'cv.pdf',
        bytes: textPretendingToBePdf(),
        replace: false,
      }),
      'unsupported_media_type',
      messages.cvWrongType,
    );
    await expectAppError(
      uploadCv(deps, { userId, filename: 'cv.pdf', bytes: new Uint8Array(), replace: false }),
      'validation_failed',
      messages.cvRequired,
    );
    const big = new Uint8Array(limits.cvUpload.maxBytes + 1);
    big.set(fakePdf());
    await expectAppError(
      uploadCv(deps, { userId, filename: 'cv.pdf', bytes: big, replace: false }),
      'payload_too_large',
      messages.cvTooLarge,
    );
    expect(enqueued).toEqual([]);
  });

  it('needs replace=true for a second CV (C04), then marks the previous one replaced', async () => {
    const { deps, rows } = setup();
    const first = await uploadCv(deps, {
      userId,
      filename: 'a.pdf',
      bytes: fakePdf(),
      replace: false,
    });
    await expectAppError(
      uploadCv(deps, { userId, filename: 'b.pdf', bytes: fakePdf(), replace: false }),
      'conflict',
    );
    const second = await uploadCv(deps, {
      userId,
      filename: 'b.pdf',
      bytes: fakePdf(),
      replace: true,
    });
    expect(rows.find((r) => r.id === first.id)?.replacedAt).toBeInstanceOf(Date);
    expect(rows.find((r) => r.id === second.id)?.replacedAt).toBeNull();
  });

  it('strips paths and control characters from the file name', async () => {
    const { deps } = setup();
    const result = await uploadCv(deps, {
      userId,
      filename: '..\\..\\etc/evil\u0007 cv.pdf',
      bytes: fakePdf(),
      replace: false,
    });
    expect(result.filename).toBe('evil cv.pdf');
  });

  it('scopes reads and download links to the owner', async () => {
    const { deps } = setup();
    const { id } = await uploadCv(deps, {
      userId,
      filename: 'Škoda CV.pdf',
      bytes: fakePdf(),
      replace: false,
    });
    await expectAppError(getUpload(deps, '22222222-2222-4222-8222-222222222222', id), 'not_found');
    const download = await getOriginalDownload(deps, userId, id);
    expect(download.filename).toBe('Škoda CV.pdf');
    expect(download.url).toContain(`users/${userId}/uploads/${id}.pdf`);
  });
});
