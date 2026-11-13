import type { FileFormat } from '@job-pilot/shared/enums';

/**
 * Object keys. Everything is under `users/<userId>/` so one user's files can be listed or removed together.
 * Keys use ids only — user-facing filenames are applied at download time (`Content-Disposition`).
 */
export const storageKeys = {
  upload: (userId: string, uploadId: string, extension: 'pdf' | 'docx') =>
    `users/${userId}/uploads/${uploadId}.${extension}`,
  /** Content hash in the key: an edited CV gets a new file, cached renders stay valid. */
  cvFile: (userId: string, cvId: string, contentHash: string, format: FileFormat) =>
    `users/${userId}/cvs/${cvId}/${contentHash}.${format}`,
  userPrefix: (userId: string) => `users/${userId}/`,
};
