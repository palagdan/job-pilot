import { limits } from '@job-pilot/shared/limits';

export type CvFileType = { extension: 'pdf' | 'docx'; mimeType: string };

const [pdfMime, docxMime] = limits.cvUpload.mimeTypes;
export const pdfType: CvFileType = { extension: 'pdf', mimeType: pdfMime };
export const docxType: CvFileType = { extension: 'docx', mimeType: docxMime };

const ascii = (s: string) => new TextEncoder().encode(s);
const pdfMagic = ascii('%PDF-');
const zipMagic = Uint8Array.of(0x50, 0x4b, 0x03, 0x04); // "PK\x03\x04"

const indexOf = (
  haystack: Uint8Array,
  needle: Uint8Array,
  from = 0,
  to = haystack.length,
): number => {
  const end = Math.min(to, haystack.length) - needle.length;
  outer: for (let i = from; i <= end; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
};

/**
 * Detects the real type from the file's bytes (the name and the browser's Content-Type are not trusted).
 * - PDF: "%PDF-" in the first 1 KB (the spec allows leading junk).
 * - DOCX: a ZIP whose entry names include "[Content_Types].xml" and "word/" (zip entry names are stored
 *   uncompressed in local file headers). Old .doc, other ZIPs, XLSX/PPTX → null.
 * The worker picks its text extractor from `mimeType`, so it must be exactly one of `limits.cvUpload.mimeTypes`.
 */
export const detectCvFileType = (bytes: Uint8Array): CvFileType | null => {
  if (indexOf(bytes, pdfMagic, 0, 1024) !== -1) return pdfType;
  if (indexOf(bytes, zipMagic, 0, zipMagic.length) === 0) {
    const isOoxml = indexOf(bytes, ascii('[Content_Types].xml')) !== -1;
    const isWord = indexOf(bytes, ascii('word/')) !== -1;
    if (isOoxml && isWord) return docxType;
  }
  return null;
};
