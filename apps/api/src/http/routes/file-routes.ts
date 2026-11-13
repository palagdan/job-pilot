import { AppError } from '@job-pilot/shared/errors';
import { contentDisposition, type FileStorage } from '@job-pilot/storage/file-storage';
import { storageKeys } from '@job-pilot/storage/keys';
import { Hono } from 'hono';
import type { AppEnv } from '../app-env.ts';

/** Local storage keeps no metadata; our keys always end in the format's extension. */
const typeByExtension: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/**
 * GET /v1/files/<key> — download URLs in local storage mode (`STORAGE_DRIVER=local` signs URLs as api paths).
 * Only the signed-in user's own files (`users/<userId>/…`); no "..". In S3 mode the browser downloads from S3 directly.
 */
export const createFileRoutes = (deps: { storage: FileStorage }) =>
  new Hono<AppEnv>().get('/*', async (c) => {
    const key = decodeURIComponent(c.req.path.replace(/^.*?\/files\//, ''));
    const ownPrefix = storageKeys.userPrefix(c.var.user.id);
    if (!key.startsWith(ownPrefix) || key.split('/').includes('..'))
      throw new AppError('not_found', 'File not found.');

    const file = await deps.storage.get(key);
    if (!file) throw new AppError('not_found', 'File not found.');

    const filename = c.req.query('filename') || key.split('/').pop() || 'file';
    const disposition = c.req.query('disposition') === 'inline' ? 'inline' : 'attachment';
    return c.body(file.body.slice().buffer as ArrayBuffer, 200, {
      'content-type':
        file.contentType ??
        typeByExtension[key.split('.').pop() ?? ''] ??
        'application/octet-stream',
      'content-length': String(file.sizeBytes),
      'content-disposition': contentDisposition(filename, disposition),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    });
  });
