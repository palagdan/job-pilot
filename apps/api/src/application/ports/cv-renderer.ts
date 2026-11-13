import type { CvContent } from '@job-pilot/shared/cv';
import type { FileFormat } from '@job-pilot/shared/enums';

/** Turns a structured CV into a file. Implemented by `@job-pilot/cv-render` (React-PDF + docx). */
export interface CvRenderer {
  render(
    content: CvContent,
    format: FileFormat,
  ): Promise<{ bytes: Uint8Array; pageCount: number | null }>;
  /** Changes when the content or the renderer's layout changes → cached files are reused only when identical. */
  cacheKey(content: CvContent): string;
  contentType(format: FileFormat): string;
}
