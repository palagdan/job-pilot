import { contentDisposition, type FileStorage, type StoredFile } from './file-storage.ts';

/** In-memory `FileStorage` for use-case tests. `files` is exposed for assertions. */
export const createMemoryFileStorage = (): FileStorage & { files: Map<string, StoredFile> } => {
  const files = new Map<string, StoredFile>();
  return {
    files,
    put: async ({ key, body, contentType }) => {
      files.set(key, { body: body.slice(), contentType, sizeBytes: body.byteLength });
    },
    get: async (key) => files.get(key) ?? null,
    exists: async (key) => files.has(key),
    delete: async (key) => {
      files.delete(key);
    },
    signedDownloadUrl: async (key, { filename, disposition = 'attachment' }) =>
      `memory://${key}?disposition=${encodeURIComponent(contentDisposition(filename, disposition))}`,
  };
};
