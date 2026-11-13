import { createHash } from 'node:crypto';
import type { CvContent } from '@job-pilot/shared/cv';

/** Bump when the PDF/DOCX layout changes, so cached files are rendered again. */
export const rendererVersion = 'cv-render@1';

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
};

/** Cache key for rendered files: same content + same renderer version → same file. 16 hex chars. */
export const cvContentHash = (content: CvContent): string =>
  createHash('sha256')
    .update(`${rendererVersion}\n${JSON.stringify(canonical(content))}`)
    .digest('hex')
    .slice(0, 16);
