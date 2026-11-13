import { AppError } from '@job-pilot/shared/errors';
import type { Upload } from '@job-pilot/shared/upload';
import type { FileStorage } from '@job-pilot/storage/file-storage';
import type { UploadRepository } from '../ports/upload-repository.ts';
import { toUploadDto } from './upload-dto.ts';

/** GET /v1/uploads/current — the user's current CV upload (or null), so onboarding step 1 can resume after a reload. */
export async function getCurrentUpload(
  deps: { uploads: UploadRepository },
  userId: string,
): Promise<Upload | null> {
  const found = await deps.uploads.findCurrentCv(userId);
  return found ? toUploadDto(found) : null;
}

/** GET /v1/uploads/:id — polled by onboarding step 1 while the worker reads the CV. */
export async function getUpload(
  deps: { uploads: UploadRepository },
  userId: string,
  id: string,
): Promise<Upload> {
  const found = await deps.uploads.findOwned(id, userId);
  if (!found) throw new AppError('not_found', 'Upload not found.');
  return toUploadDto(found);
}

/** GET /v1/uploads/:id/download — short-lived link to the original file ("Your original", kept unchanged). */
export async function getOriginalDownload(
  deps: { uploads: UploadRepository; storage: FileStorage },
  userId: string,
  id: string,
): Promise<{ url: string; filename: string }> {
  const found = await deps.uploads.findOwned(id, userId);
  if (!found) throw new AppError('not_found', 'Upload not found.');
  const url = await deps.storage.signedDownloadUrl(found.storageKey, {
    filename: found.filename,
    expiresInSeconds: 300,
  });
  return { url, filename: found.filename };
}
