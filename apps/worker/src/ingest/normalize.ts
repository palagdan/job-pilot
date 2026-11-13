import { createHash } from 'node:crypto';

export const MAX_DESCRIPTION_LENGTH = 20_000;

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();

const squash = (value: string) =>
  fold(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

type CityInfo = { city: string; region: string };

const PRAHA = { city: 'Praha', region: 'Hlavní město Praha' };
const cities: Array<[aliases: string[], info: CityInfo]> = [
  [['hlavni mesto praha', 'praha', 'prague', 'prag', 'praga'], PRAHA],
  [['brno', 'brno mesto'], { city: 'Brno', region: 'Jihomoravský kraj' }],
  [['ostrava'], { city: 'Ostrava', region: 'Moravskoslezský kraj' }],
  [['plzen', 'pilsen'], { city: 'Plzeň', region: 'Plzeňský kraj' }],
  [['olomouc'], { city: 'Olomouc', region: 'Olomoucký kraj' }],
  [['liberec'], { city: 'Liberec', region: 'Liberecký kraj' }],
  [['ceske budejovice'], { city: 'České Budějovice', region: 'Jihočeský kraj' }],
  [['hradec kralove'], { city: 'Hradec Králové', region: 'Královéhradecký kraj' }],
  [['pardubice'], { city: 'Pardubice', region: 'Pardubický kraj' }],
  [['zlin'], { city: 'Zlín', region: 'Zlínský kraj' }],
  [['usti nad labem'], { city: 'Ústí nad Labem', region: 'Ústecký kraj' }],
  [['karlovy vary'], { city: 'Karlovy Vary', region: 'Karlovarský kraj' }],
  [['jihlava'], { city: 'Jihlava', region: 'Kraj Vysočina' }],
];

const aliasIndex = cities
  .flatMap(([aliases, info]) => aliases.map((alias) => [alias, info] as const))
  .sort((a, b) => b[0].length - a[0].length);

const COUNTRY_WORDS = /^(cesko|ceska republika|czechia|czech republic|cz)$/;
const POSTCODE = /^\d{3}\s?\d{2}\s+/;

export type NormalizedCity = { city: string | null; region: string | null; isCzech: boolean };

export const normalizeCity = (raw: string | null | undefined): NormalizedCity => {
  const empty = { city: null, region: null, isCzech: false };
  if (!raw?.trim()) return empty;

  const segments = raw
    .split(',')
    .map((segment) => segment.trim().replace(POSTCODE, ''))
    .filter(Boolean);

  for (const segment of segments) {
    const folded = squash(segment);
    const hit = aliasIndex.find(([alias]) => folded === alias || folded.startsWith(`${alias} `));
    if (hit) return { ...hit[1], isCzech: true };
  }

  const fallback =
    segments.find((s) => !/\d/.test(s) && !COUNTRY_WORDS.test(squash(s))) ?? segments[0];
  const city = fallback?.trim() || null;
  const isCzech = /(^|[\s,])(czech|česk|cesk)/i.test(raw);
  return { city, region: null, isCzech };
};

const CS_STOP = [
  'jsme',
  'jsou',
  'nebo',
  'také',
  'který',
  'která',
  'které',
  'práce',
  'pro',
  'ale',
  'být',
  'při',
  'své',
  'nabízíme',
  'hledáme',
  'budete',
  'máte',
  'zkušenosti',
  'se',
  'je',
  'na',
];
const SK_STOP = [
  'som',
  'sme',
  'alebo',
  'tiež',
  'ktorý',
  'ktorá',
  'ktoré',
  'práca',
  'pre',
  'ako',
  'aj',
  'ponúkame',
  'hľadáme',
  'budete',
  'máte',
  'skúsenosti',
  'sa',
  'je',
  'na',
];
const EN_STOP = ['the', 'and', 'with', 'for', 'you', 'our', 'are', 'will', 'to', 'of', 'in', 'we'];

const countWords = (words: string[], list: string[]) => {
  const set = new Set(list);
  return words.reduce((n, w) => n + (set.has(w) ? 1 : 0), 0);
};
const countChars = (text: string, chars: RegExp) => (text.match(chars) ?? []).length;

export const detectLanguage = (text: string | null | undefined): 'cs' | 'sk' | 'en' | null => {
  const sample = (text ?? '').slice(0, 3000).toLowerCase();
  if (sample.trim().length < 30) return null;
  const words = sample.match(/\p{L}+/gu) ?? [];
  if (words.length < 5) return null;

  const cs = countWords(words, CS_STOP) + countChars(sample, /[řůě]/g) * 2;
  const sk = countWords(words, SK_STOP) + countChars(sample, /[äôľŕĺ]/g) * 3;
  const en = countWords(words, EN_STOP);

  const best = Math.max(cs, sk, en);
  if (best < 2) return null;
  if (en === best && en > cs && en > sk) return 'en';
  if (sk > cs) return 'sk';
  if (cs >= sk && cs >= en) return 'cs';
  return en === best ? 'en' : null;
};

const LEGAL_SUFFIXES = [
  'spol s r o',
  's r o',
  'a s',
  'k s',
  'v o s',
  'z s',
  'gmbh',
  'ltd',
  'inc',
  'llc',
];

const normalizeCompany = (company: string) => {
  let value = squash(company);
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of LEGAL_SUFFIXES) {
      if (value.endsWith(` ${suffix}`)) {
        value = value.slice(0, -suffix.length - 1).trim();
        changed = true;
      }
    }
  }
  return value;
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export const dedupeKeyForJob = ({
  title,
  company,
  city,
}: {
  title: string;
  company: string;
  city: string | null | undefined;
}) => `job:${sha256([squash(title), normalizeCompany(company), squash(city ?? '')].join('|'))}`;

export const dedupeKeyForEvent = ({
  title,
  startsAt,
  city,
}: {
  title: string;
  startsAt: Date;
  city: string | null | undefined;
}) =>
  `event:${sha256([squash(title), startsAt.toISOString().slice(0, 10), squash(city ?? '')].join('|'))}`;

const KEPT_PARAMS = ['jk'];

export const canonicalUrl = (url: string) => {
  try {
    const parsed = new URL(url.trim());
    const kept = new URLSearchParams();
    for (const name of KEPT_PARAMS) {
      const value = parsed.searchParams.get(name);
      if (value) kept.set(name, value);
    }
    const query = kept.size ? `?${kept}` : '';
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${query}`;
  } catch {
    return url.trim();
  }
};

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export const stripHtml = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|ul|ol)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const truncate = (text: string, max = MAX_DESCRIPTION_LENGTH) =>
  text.length > max ? text.slice(0, max) : text;
