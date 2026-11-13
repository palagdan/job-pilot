import type { CvContent } from './cv.ts';
import type { LanguageLevel } from './enums.ts';

/** CV text formatting shared by the PDF, the DOCX and the web preview, so all three say exactly the same thing. */

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2020-03" → "Mar 2020". */
export const formatYearMonth = (value: string | null): string | null => {
  if (!value) return null;
  const [year, month] = value.split('-');
  const m = months[Number(month) - 1];
  return m ? `${m} ${year}` : (year ?? null);
};

/** "Mar 2020 – Present" (no end = current), "Sep 2015 – Jun 2019", or "" when there are no dates. */
export const formatPeriod = (start: string | null, end: string | null): string => {
  const from = formatYearMonth(start);
  const to = end ? formatYearMonth(end) : from ? 'Present' : null;
  if (from && to) return `${from} – ${to}`;
  return from ?? to ?? '';
};

const levelLabels: Record<LanguageLevel, string> = {
  basic: 'Basic',
  conversational: 'Conversational',
  professional: 'Professional',
  native: 'Native',
};

export const formatLanguages = (languages: CvContent['languages']) =>
  languages.map((l) => `${l.language} (${levelLabels[l.level]})`).join(' · ');

/** Location · email · phone · links (labels shown as the URL without protocol). */
export const contactLine = (header: CvContent['header']) =>
  [
    header.location,
    header.email,
    header.phone,
    ...header.links.map((l) => l.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')),
  ]
    .filter(Boolean)
    .join('  ·  ');

/** "Head of Growth — Company A" */
export const roleLine = (title: string, company: string) =>
  [title, company].filter(Boolean).join(' — ');

/** "MSc, Marketing — Prague University of Economics" */
export const educationLine = (e: CvContent['education'][number]) =>
  [[e.degree, e.field].filter(Boolean).join(', '), e.school].filter(Boolean).join(' — ');

export const sectionTitles = {
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  skills: 'Skills',
  languages: 'Languages',
  projects: 'Projects',
} as const;
