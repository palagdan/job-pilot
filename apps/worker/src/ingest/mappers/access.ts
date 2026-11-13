import type { WorkFormat } from '@job-pilot/shared/enums';
import { stripHtml, truncate } from '../normalize.ts';
import { redactContacts } from '../scrub.ts';

export type Rec = Record<string, unknown>;

export const asRec = (value: unknown): Rec =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : {};

export const str = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

export const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export const strArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(str).filter((v): v is string => v !== null) : [];

export const date = (value: unknown): Date | null => {
  const text = str(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const httpUrl = (value: unknown): string | null => {
  const text = str(value);
  return text && /^https?:\/\//i.test(text) ? text : null;
};

export const countryCode = (value: unknown): string | null => {
  const text = str(value);
  return text && /^[a-z]{2}$/i.test(text) ? text.toUpperCase() : null;
};

/** Plain text from a description that may hold HTML; contacts redacted, length capped. */
export const cleanDescription = (value: unknown): string | null => {
  const text = str(value);
  if (!text) return null;
  const plain = /<[a-z][\s\S]*>/i.test(text) ? stripHtml(text) : text;
  return truncate(redactContacts(plain)) || null;
};

export const toWorkFormat = (value: unknown): WorkFormat | null => {
  const key = (str(value) ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (['remote', 'fullyremote', 'homeoffice', 'remoteonly'].includes(key)) return 'remote';
  if (key === 'hybrid') return 'hybrid';
  if (['onsite', 'office', 'inoffice', 'onpremise', 'inperson'].includes(key)) return 'onsite';
  return null;
};

export const workFormatList = (...values: unknown[]): WorkFormat[] => {
  const found = values.flatMap((v) => (Array.isArray(v) ? v : [v])).map(toWorkFormat);
  return [...new Set(found.filter((v): v is WorkFormat => v !== null))];
};
