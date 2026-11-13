import type { Logger } from '@job-pilot/logger/logger';
import type { Cv, CvContent, CvList, CvSummary } from '@job-pilot/shared/cv';
import { cvFileBaseName } from '@job-pilot/shared/cv-file-name';
import type { FileFormat } from '@job-pilot/shared/enums';
import { AppError } from '@job-pilot/shared/errors';
import { messages } from '@job-pilot/shared/limits';
import type { FileStorage } from '@job-pilot/storage/file-storage';
import type { CvFileRepository } from '../ports/cv-file-repository.ts';
import type { CvRenderer } from '../ports/cv-renderer.ts';
import type { CvRecord, CvRepository } from '../ports/cv-repository.ts';
import type { JobQueue } from '../ports/job-queue.ts';
import type { UploadRepository } from '../ports/upload-repository.ts';
import { getCvFile } from './get-cv-file.ts';

export type CvDeps = {
  cvs: CvRepository;
  uploads: UploadRepository;
  storage: FileStorage;
  renderer: CvRenderer;
  cvFiles: CvFileRepository;
  jobs: JobQueue;
  log: Logger;
  now?: () => Date;
};

const now = (deps: { now?: () => Date }) => (deps.now ?? (() => new Date()))();

export const fileBaseNameOf = (r: Pick<CvRecord, 'kind' | 'version' | 'naming'>) =>
  r.kind === 'master'
    ? cvFileBaseName({ kind: 'master', fullName: r.naming.fullName, version: r.version })
    : cvFileBaseName({ kind: 'special', company: r.naming.company, role: r.naming.role });

export const toCvSummary = (r: CvRecord): CvSummary => ({
  id: r.id,
  kind: r.kind,
  origin: r.origin,
  version: r.version,
  status: r.status,
  fileBaseName: fileBaseNameOf(r),
  basedOnCvId: r.basedOnCvId,
  pipelineItemId: r.pipelineItemId,
  changes: r.changes,
  pageCount: r.pageCount,
  confirmedAt: r.confirmedAt?.toISOString() ?? null,
  sentAt: r.sentAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

const toCv = (r: CvRecord): Cv => ({ ...toCvSummary(r), content: r.content });

const findOwnedOrThrow = async (deps: { cvs: CvRepository }, userId: string, id: string) => {
  const found = await deps.cvs.findOwned(id, userId);
  if (!found) throw new AppError('not_found', 'CV not found.');
  return found;
};

/** The master in use: the newest version that is not superseded (may be awaiting review after a regenerate). */
const currentMaster = (all: CvRecord[]) =>
  all
    .filter((r) => r.kind === 'master' && !r.supersededAt)
    .sort((a, b) => b.version - a.version)[0] ?? null;

/** GET /v1/cvs — CVs page: master card, original upload, special CVs (newest first). */
export async function listCvs(
  deps: Pick<CvDeps, 'cvs' | 'uploads'>,
  userId: string,
): Promise<CvList> {
  const all = await deps.cvs.listForUser(userId);
  const master = currentMaster(all);
  const original = await deps.uploads.findCurrentCv(userId);
  return {
    master: master ? toCvSummary(master) : null,
    original: original ? { uploadId: original.id, filename: original.filename } : null,
    special: all.filter((r) => r.kind === 'special').map(toCvSummary),
  };
}

export async function getCv(deps: Pick<CvDeps, 'cvs'>, userId: string, id: string): Promise<Cv> {
  return toCv(await findOwnedOrThrow(deps, userId, id));
}

/** C02 "Use this CV for applications?" — a master awaiting review becomes the master in use. Idempotent. */
export async function confirmCv(
  deps: Pick<CvDeps, 'cvs' | 'now'>,
  userId: string,
  id: string,
): Promise<Cv> {
  const found = await findOwnedOrThrow(deps, userId, id);
  if (found.kind !== 'master') throw new AppError('conflict', 'Only a master CV can be confirmed.');
  if (found.status === 'confirmed' && !found.supersededAt) return toCv(found);
  if (found.status !== 'needs_review')
    throw new AppError('conflict', 'This CV cannot be confirmed yet.');
  await deps.cvs.confirmMaster(id, userId, now(deps));
  return getCv(deps, userId, id);
}

/**
 * C03 "Use your original CV?" (also E05 "Use my original"): a new master version from the uploaded file's text,
 * already confirmed. The agent builds applications from it.
 */
export async function keepOriginalCv(
  deps: Pick<CvDeps, 'cvs' | 'uploads' | 'now'>,
  userId: string,
): Promise<Cv> {
  const original = await deps.uploads.findCurrentCv(userId);
  if (!original) throw new AppError('validation_failed', messages.cvRequired);
  if (original.parseStatus !== 'parsed' || !original.parsedContent) {
    throw new AppError('conflict', 'We are still reading your CV. Try again in a few seconds.');
  }
  const id = await deps.cvs.createMasterFromOriginal({
    userId,
    uploadId: original.id,
    content: original.parsedContent,
    at: now(deps),
  });
  return getCv(deps, userId, id);
}

const assertEditable = (r: CvRecord) => {
  if (r.status === 'sent')
    throw new AppError('conflict', 'A CV that was already sent cannot be changed.');
  if (r.status === 'generating' || !r.content)
    throw new AppError('conflict', 'This CV is still being written.');
};

/** "Edit text": replaces the structured content; the next download renders a new file. Not for sent CVs. */
export async function editCv(
  deps: Pick<CvDeps, 'cvs'>,
  userId: string,
  id: string,
  content: CvContent,
): Promise<Cv> {
  assertEditable(await findOwnedOrThrow(deps, userId, id));
  await deps.cvs.updateContent(id, content);
  return getCv(deps, userId, id);
}

/**
 * "Regenerate": master → the worker writes a new version from the current upload + profile (cv.generate-master);
 * the new version appears as "Needs your review". Special CVs are regenerated with their application pack (M4).
 */
export async function regenerateCv(
  deps: Pick<CvDeps, 'cvs' | 'uploads' | 'jobs'>,
  userId: string,
  id: string,
): Promise<Cv> {
  const found = await findOwnedOrThrow(deps, userId, id);
  if (found.status === 'sent')
    throw new AppError('conflict', 'A CV that was already sent cannot be changed.');
  if (found.kind === 'special') {
    throw new AppError(
      'conflict',
      'Special CVs are regenerated together with their application pack.',
    );
  }
  const original = await deps.uploads.findCurrentCv(userId);
  if (original?.parseStatus !== 'parsed') throw new AppError('conflict', 'Upload a CV first.');
  await deps.jobs.enqueueGenerateMasterCv(userId, original.id);
  return toCv(found);
}

/** C05 "Delete this CV?" — not for the confirmed master in use. Rendered files are removed from storage too. */
export async function deleteCv(
  deps: Pick<CvDeps, 'cvs' | 'storage' | 'log'>,
  userId: string,
  id: string,
): Promise<void> {
  const found = await findOwnedOrThrow(deps, userId, id);
  if (found.kind === 'master' && found.status === 'confirmed' && !found.supersededAt) {
    throw new AppError(
      'conflict',
      'Your confirmed master CV cannot be deleted. Replace it in CVs instead.',
    );
  }
  const keys = await deps.cvs.delete(id);
  for (const key of keys) {
    // Best effort: an orphaned file is harmless, a failed delete must not undo the user's action.
    await deps.storage
      .delete(key)
      .catch((error: unknown) => deps.log.warn('cv file delete failed', { key, error }));
  }
}

/**
 * "Compare" — returns both sides; the web shows the diff.
 * - special CV (default): its master;
 * - master (default): the original upload (as a pseudo-CV built from its parsed text);
 * - `with`: any other of the user's CVs.
 */
export async function compareCv(
  deps: Pick<CvDeps, 'cvs' | 'uploads'>,
  userId: string,
  id: string,
  withId?: string,
): Promise<{ base: Cv; other: Cv }> {
  const other = await findOwnedOrThrow(deps, userId, id);
  if (withId)
    return { base: toCv(await findOwnedOrThrow(deps, userId, withId)), other: toCv(other) };

  if (other.kind === 'special') {
    if (!other.basedOnCvId)
      throw new AppError('not_found', 'This CV has no master to compare with.');
    return {
      base: toCv(await findOwnedOrThrow(deps, userId, other.basedOnCvId)),
      other: toCv(other),
    };
  }

  const original = await deps.uploads.findCurrentCv(userId);
  if (!original?.parsedContent)
    throw new AppError('not_found', 'Your original CV has not been read yet.');
  const base: Cv = {
    ...toCv(other),
    id: original.id,
    origin: 'original',
    version: 0,
    status: 'confirmed',
    fileBaseName: original.filename.replace(/\.(pdf|docx)$/i, ''),
    changes: [],
    pageCount: original.pageCount,
    confirmedAt: null,
    createdAt: original.createdAt.toISOString(),
    updatedAt: original.createdAt.toISOString(),
    content: original.parsedContent,
  };
  return { base, other: toCv(other) };
}

/** GET /v1/cvs/:id/download?format= — renders (or reuses) the file and returns a short-lived link. E08 on failure. */
export async function downloadCv(
  deps: Pick<CvDeps, 'cvs' | 'storage' | 'renderer' | 'cvFiles'>,
  userId: string,
  id: string,
  format: FileFormat,
): Promise<{ url: string; filename: string }> {
  const found = await findOwnedOrThrow(deps, userId, id);
  const file = await getCvFile(
    deps,
    { id: found.id, userId, content: found.content, fileBaseName: fileBaseNameOf(found) },
    format,
  );
  if (file.pageCount && file.pageCount !== found.pageCount)
    await deps.cvs.setPageCount(found.id, file.pageCount);
  const url = await deps.storage.signedDownloadUrl(file.storageKey, {
    filename: file.filename,
    expiresInSeconds: 300,
  });
  return { url, filename: file.filename };
}
