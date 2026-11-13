import { limits } from '@job-pilot/shared/limits';
import { describe, expect, it } from 'vitest';
import {
  fakeDocx,
  fakePdf,
  fakeXlsx,
  legacyDoc,
  textPretendingToBePdf,
} from '../../test/fixtures.ts';
import { detectCvFileType } from './detect-cv-file-type.ts';

describe('detectCvFileType', () => {
  it('detects PDF and DOCX with the exact mime types the worker expects', () => {
    expect(detectCvFileType(fakePdf())).toEqual({
      extension: 'pdf',
      mimeType: limits.cvUpload.mimeTypes[0],
    });
    expect(detectCvFileType(fakeDocx())).toEqual({
      extension: 'docx',
      mimeType: limits.cvUpload.mimeTypes[1],
    });
  });

  it('accepts a PDF header after leading junk (within 1 KB)', () => {
    const bytes = new Uint8Array([...new Uint8Array(100), ...fakePdf()]);
    expect(detectCvFileType(bytes)?.extension).toBe('pdf');
  });

  it.each([
    ['renamed text file', textPretendingToBePdf()],
    ['legacy .doc (OLE)', legacyDoc()],
    ['other OOXML zip (xlsx)', fakeXlsx()],
    ['empty', new Uint8Array()],
  ])('rejects %s', (_, bytes) => {
    expect(detectCvFileType(bytes)).toBeNull();
  });
});
