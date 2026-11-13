import mammoth from 'mammoth';
import { extractText } from 'unpdf';

export const MIN_TEXT_CHARS = 200;

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type ExtractedText = { text: string; pageCount: number | null };

export const normaliseWhitespace = (text: string) =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const hasEnoughText = (text: string) => text.replace(/\s/g, '').length >= MIN_TEXT_CHARS;

/** Throws on unsupported, broken or password-protected files. Does not check the amount of text. */
export const extractCvText = async (body: Uint8Array, mimeType: string): Promise<ExtractedText> => {
  if (mimeType === PDF) {
    const { text, totalPages } = await extractText(new Uint8Array(body), { mergePages: true });
    return { text: normaliseWhitespace(text), pageCount: totalPages };
  }
  if (mimeType === DOCX) {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(body) });
    return { text: normaliseWhitespace(value), pageCount: null };
  }
  throw new Error(`Unsupported mime type: ${mimeType}`);
};
