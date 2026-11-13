/**
 * File storage port: original CV uploads, rendered CV PDF/DOCX, data exports.
 * Application code depends on this interface only; adapters: S3 (`s3-file-storage.ts`), in-memory (tests).
 * Files are small (CVs ≤ 5 MB), so bodies are plain byte arrays.
 */
export interface FileStorage {
  put(input: { key: string; body: Uint8Array; contentType: string }): Promise<void>;
  /** Null when the key does not exist. */
  get(key: string): Promise<StoredFile | null>;
  exists(key: string): Promise<boolean>;
  /** Idempotent: deleting a missing key is not an error. */
  delete(key: string): Promise<void>;
  /**
   * Short-lived URL the browser downloads from directly.
   * `filename` is what the user sees ("CV - Company - Role.pdf"); keys never contain user-facing names.
   */
  signedDownloadUrl(key: string, options: SignedUrlOptions): Promise<string>;
}

export type StoredFile = { body: Uint8Array; contentType: string | null; sizeBytes: number };

export type SignedUrlOptions = {
  filename: string;
  /** Default 300 s. */
  expiresInSeconds?: number;
  /** `inline` opens in the browser (PDF preview), `attachment` downloads. Default `attachment`. */
  disposition?: 'attachment' | 'inline';
};

/** `Content-Disposition` with an ASCII fallback and RFC 5987 UTF-8 name (Czech characters in company names). */
export const contentDisposition = (
  filename: string,
  disposition: 'attachment' | 'inline' = 'attachment',
) => {
  const ascii = filename
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
};
