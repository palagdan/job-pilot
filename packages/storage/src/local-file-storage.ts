import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { FileStorage } from './file-storage.ts';

/**
 * Local-disk `FileStorage` for development without S3. api and worker must point at the same
 * directory. Content types are not stored, so `get` returns `contentType: null` (callers use the
 * mime type from the database).
 * Signed URLs are api paths (`/v1/files/<key>`): the api needs a route that serves them in local mode.
 */
export const createLocalFileStorage = (rootDir: string): FileStorage => {
  const root = resolve(rootDir);
  const pathFor = (key: string) => {
    const path = resolve(join(root, key));
    if (!path.startsWith(root + sep)) throw new Error(`Invalid storage key: ${key}`);
    return path;
  };
  const isMissing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';

  return {
    put: async ({ key, body }) => {
      const path = pathFor(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    },
    get: async (key) => {
      try {
        const body = new Uint8Array(await readFile(pathFor(key)));
        return { body, contentType: null, sizeBytes: body.byteLength };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    exists: async (key) => {
      try {
        return (await stat(pathFor(key))).isFile();
      } catch (error) {
        if (isMissing(error)) return false;
        throw error;
      }
    },
    delete: async (key) => {
      await rm(pathFor(key), { force: true });
    },
    signedDownloadUrl: async (key, { filename, disposition = 'attachment' }) =>
      `/v1/files/${key}?filename=${encodeURIComponent(filename)}&disposition=${disposition}`,
  };
};
