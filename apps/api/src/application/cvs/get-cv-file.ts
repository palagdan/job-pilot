import type { CvContent } from '@job-pilot/shared/cv';
import type { FileFormat } from '@job-pilot/shared/enums';
import { AppError } from '@job-pilot/shared/errors';
import type { FileStorage } from '@job-pilot/storage/file-storage';
import { storageKeys } from '@job-pilot/storage/keys';
import type { CvFileRepository } from '../ports/cv-file-repository.ts';
import type { CvRenderer } from '../ports/cv-renderer.ts';

export type GetCvFileDeps = {
  renderer: CvRenderer;
  cvFiles: CvFileRepository;
  storage: FileStorage;
};

export type RenderableCv = {
  id: string;
  userId: string;
  /** Null while the agent is still writing it. */
  content: CvContent | null;
  /** "User_Name_CV_JobPilot_v1" / "CV - Company - Role" (without extension). */
  fileBaseName: string;
};

export type CvFile = {
  storageKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  /** Set when this call rendered a PDF (otherwise unknown/unchanged). */
  pageCount: number | null;
  cached: boolean;
};

/**
 * The PDF/DOCX for a CV, rendered at most once per content version: the cache key is the content hash, so an
 * edited CV gets a new file and an unchanged one is served from storage (`cv_file` + object storage).
 */
export async function getCvFile(
  deps: GetCvFileDeps,
  cv: RenderableCv,
  format: FileFormat,
): Promise<CvFile> {
  if (!cv.content)
    throw new AppError('conflict', 'This CV is still being written. Try again in a moment.');

  const contentHash = deps.renderer.cacheKey(cv.content);
  const filename = `${cv.fileBaseName}.${format}`;
  const contentType = deps.renderer.contentType(format);

  const cached = await deps.cvFiles.find(cv.id, format, contentHash);
  if (cached && (await deps.storage.exists(cached.storageKey))) {
    return {
      storageKey: cached.storageKey,
      filename,
      contentType,
      sizeBytes: cached.sizeBytes,
      pageCount: null,
      cached: true,
    };
  }

  const { bytes, pageCount } = await deps.renderer.render(cv.content, format);
  const storageKey = storageKeys.cvFile(cv.userId, cv.id, contentHash, format);
  await deps.storage.put({ key: storageKey, body: bytes, contentType });
  await deps.cvFiles.save({
    cvId: cv.id,
    format,
    contentHash,
    storageKey,
    sizeBytes: bytes.byteLength,
  });
  return {
    storageKey,
    filename,
    contentType,
    sizeBytes: bytes.byteLength,
    pageCount,
    cached: false,
  };
}
