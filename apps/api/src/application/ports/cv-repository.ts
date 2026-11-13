import type { CvContent } from '@job-pilot/shared/cv';
import type { CvKind, CvOrigin, CvStatus } from '@job-pilot/shared/enums';

export type CvRecord = {
  id: string;
  userId: string;
  kind: CvKind;
  origin: CvOrigin;
  version: number;
  status: CvStatus;
  content: CvContent | null;
  changes: string[];
  basedOnCvId: string | null;
  uploadId: string | null;
  pipelineItemId: string | null;
  pageCount: number | null;
  error: string | null;
  confirmedAt: Date | null;
  sentAt: Date | null;
  supersededAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** For file names: profile name (fallback: account name) for masters; company + role for special CVs. */
  naming: { fullName: string | null; company: string | null; role: string | null };
};

export interface CvRepository {
  /** All of the user's CVs, newest first (masters and special). */
  listForUser(userId: string): Promise<CvRecord[]>;
  findOwned(id: string, userId: string): Promise<CvRecord | null>;
  /** C02: marks this master confirmed and supersedes the user's other master versions (one transaction). */
  confirmMaster(id: string, userId: string, at: Date): Promise<void>;
  /** C03: new master version from the original upload's parsed text, already confirmed; supersedes the others. */
  createMasterFromOriginal(input: {
    userId: string;
    uploadId: string;
    content: CvContent;
    at: Date;
  }): Promise<string>;
  updateContent(id: string, content: CvContent): Promise<void>;
  setPageCount(id: string, pageCount: number): Promise<void>;
  /** Deletes the CV (cv_file rows cascade) and returns the storage keys of its rendered files. */
  delete(id: string): Promise<string[]>;
}
