import { cvContentHash } from '@job-pilot/cv-render/content-hash';
import { cvContentTypes } from '@job-pilot/cv-render/file-name';
import { renderCvDocx } from '@job-pilot/cv-render/render-docx';
import { renderCvPdf } from '@job-pilot/cv-render/render-pdf';
import type { CvRenderer } from '../../application/ports/cv-renderer.ts';

export const createCvRenderer = (): CvRenderer => ({
  render: async (content, format) => {
    if (format === 'pdf') return renderCvPdf(content);
    const { bytes } = await renderCvDocx(content);
    return { bytes, pageCount: null };
  },
  cacheKey: cvContentHash,
  contentType: (format) => cvContentTypes[format],
});
