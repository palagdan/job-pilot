import type { Logger } from '@job-pilot/logger/logger';
import { AppError } from '@job-pilot/shared/errors';
import { limits, messages } from '@job-pilot/shared/limits';
import type { Upload } from '@job-pilot/shared/upload';
import type { FileStorage } from '@job-pilot/storage/file-storage';
import { storageKeys } from '@job-pilot/storage/keys';
import type { JobQueue } from '../ports/job-queue.ts';
import type { UploadRepository } from '../ports/upload-repository.ts';
import { detectCvFileType } from './detect-cv-file-type.ts';
import { toUploadDto } from './upload-dto.ts';

export type UploadCvDeps = {
  uploads: UploadRepository;
  storage: FileStorage;
  jobs: JobQueue;
  log: Logger;
  newId?: () => string;
};

export type UploadCvInput = {
  userId: string;
  filename: string;
  bytes: Uint8Array;
  /** C04: the user confirmed replacing the existing CV. */
  replace: boolean;
};

/** Keeps the name readable but safe to store and show (no paths, no control characters, ≤ 120 chars). */
const cleanFilename = (name: string, extension: string) => {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 120);
  return cleaned || `cv.${extension}`;
};

/**
 * Onboarding 1 / CVs > Upload new CV. Checks size and the real file type, stores the original unchanged,
 * records it as `pending` and enqueues `cv.parse` (the worker extracts text, parses, pre-fills the profile).
 * A second CV needs `replace` (C04); the previous upload is then marked replaced.
 */
export async function uploadCv(deps: UploadCvDeps, input: UploadCvInput): Promise<Upload> {
  if (input.bytes.byteLength === 0)
    throw new AppError('validation_failed', messages.cvRequired, { file: messages.cvRequired });
  if (input.bytes.byteLength > limits.cvUpload.maxBytes)
    throw new AppError('payload_too_large', messages.cvTooLarge);

  const type = detectCvFileType(input.bytes);
  if (!type) throw new AppError('unsupported_media_type', messages.cvWrongType);

  const current = await deps.uploads.findCurrentCv(input.userId);
  if (current && !input.replace) {
    throw new AppError('conflict', 'You already uploaded a CV. Confirm to replace it.');
  }

  const id = deps.newId ? deps.newId() : crypto.randomUUID();
  const storageKey = storageKeys.upload(input.userId, id, type.extension);
  await deps.storage.put({ key: storageKey, body: input.bytes, contentType: type.mimeType });

  const created = await deps.uploads.create(
    {
      id,
      userId: input.userId,
      storageKey,
      filename: cleanFilename(input.filename, type.extension),
      mimeType: type.mimeType,
      sizeBytes: input.bytes.byteLength,
    },
    { replacePrevious: Boolean(current) },
  );

  try {
    await deps.jobs.enqueueCvParse(created.id);
  } catch (error) {
    // The upload is stored and stays `pending`; re-uploading or a retry endpoint can re-enqueue.
    deps.log.error('cv.parse enqueue failed', { uploadId: created.id, error });
    throw error;
  }
  return toUploadDto(created);
}
