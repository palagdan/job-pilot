import type { FileFormat } from '@job-pilot/shared/enums';

export type CvFileRecord = {
  cvId: string;
  format: FileFormat;
  contentHash: string;
  storageKey: string;
  sizeBytes: number;
};

/** Cache of rendered CV files (`cv_file`): one row per CV, format and content hash. */
export interface CvFileRepository {
  find(cvId: string, format: FileFormat, contentHash: string): Promise<CvFileRecord | null>;
  /** Idempotent: a concurrent render of the same content keeps the first row. */
  save(record: CvFileRecord): Promise<void>;
}
