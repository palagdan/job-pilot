import type { Upload } from '@job-pilot/shared/upload';
import type { UploadRecord } from '../ports/upload-repository.ts';

export const toUploadDto = (u: UploadRecord): Upload => ({
  id: u.id,
  filename: u.filename,
  sizeBytes: u.sizeBytes,
  pageCount: u.pageCount,
  parseStatus: u.parseStatus,
  parseError: u.parseError,
  createdAt: u.createdAt.toISOString(),
});
