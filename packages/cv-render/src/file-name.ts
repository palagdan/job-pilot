import type { FileFormat } from '@job-pilot/shared/enums';

/** Content types of the rendered files. File names live in `@job-pilot/shared/cv-file-name` (web + api use them). */
export const cvContentTypes: Record<FileFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
