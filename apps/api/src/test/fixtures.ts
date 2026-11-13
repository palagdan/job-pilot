/** Minimal byte fixtures for file-type detection (headers only — enough for sniffing, not for parsing). */
const enc = (s: string) => new TextEncoder().encode(s);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const zipHeader = Uint8Array.of(0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0);

export const fakePdf = () => enc('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
export const fakeDocx = () =>
  concat(zipHeader, enc('[Content_Types].xml'), zipHeader, enc('word/document.xml'), enc('...'));
export const fakeXlsx = () =>
  concat(zipHeader, enc('[Content_Types].xml'), zipHeader, enc('xl/workbook.xml'));
export const legacyDoc = () => Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0);
export const textPretendingToBePdf = () => enc('Hello, I am a .txt renamed to cv.pdf');
