import type { CvContent } from '@job-pilot/shared/cv';
import type { ParseStatus } from '@job-pilot/shared/enums';

export type UploadRecord = {
  id: string;
  userId: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  parseStatus: ParseStatus;
  parseError: string | null;
  /** Structured CV from the worker's cv.parse job (null until parsed). */
  parsedContent: CvContent | null;
  replacedAt: Date | null;
  createdAt: Date;
};

export type NewUpload = Pick<
  UploadRecord,
  'id' | 'userId' | 'storageKey' | 'filename' | 'mimeType' | 'sizeBytes'
>;

export interface UploadRepository {
  /** The user's current CV upload (newest not replaced), or null. */
  findCurrentCv(userId: string): Promise<UploadRecord | null>;
  /** Scoped: another user's id returns null. */
  findOwned(id: string, userId: string): Promise<UploadRecord | null>;
  /** Inserts the new upload (status pending); with `replacePrevious` marks older CV uploads replaced in the same transaction. */
  create(upload: NewUpload, options: { replacePrevious: boolean }): Promise<UploadRecord>;
}
