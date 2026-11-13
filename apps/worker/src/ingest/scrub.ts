const PERSONAL_KEY =
  /email|phone|recruiter|ceoname|hosts|featuredguests|socialhandles|organizersocials/i;

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const INTL_PHONE = /(?:\+|\b00)\d{1,3}[\s.-]?(?:\d[\s.-]?){8,12}\b/g;
const LOCAL_PHONE = /\b\d{3}[ .-]\d{3}[ .-]\d{3}\b/g;

/** Replaces emails and phone numbers found in free text. */
export const redactContacts = (text: string) =>
  text
    .replace(EMAIL, '[removed]')
    .replace(INTL_PHONE, '[removed]')
    .replace(LOCAL_PHONE, '[removed]');

/** Deep copy of an item without personal-data keys; contacts inside strings are redacted. */
export const scrubRaw = (value: unknown, extraKeys: readonly string[] = []): unknown => {
  const extra = new Set(extraKeys);
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return redactContacts(node);
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node)
          .filter(([key]) => !PERSONAL_KEY.test(key) && !extra.has(key))
          .map(([key, child]) => [key, walk(child)]),
      );
    }
    return node;
  };
  return walk(value);
};
