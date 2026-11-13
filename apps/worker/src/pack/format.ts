import type { NoticePeriod, SalaryPeriod } from '@job-pilot/shared/enums';

export type PackLang = 'cs' | 'en';

const CZECH_CHARS = /[ěščřžýůďťňĚŠČŘŽ]/g;

/** ISO 639-1 of the posting: the stored language, else a cs/en guess from the text (default en). */
export const postingLanguage = (stored: string | null | undefined, description: string): string => {
  const s = stored?.trim().toLowerCase().slice(0, 2);
  if (s) return s;
  return (description.match(CZECH_CHARS)?.length ?? 0) >= 3 ? 'cs' : 'en';
};

/** Deterministic texts exist in Czech and English only. */
export const packLang = (language: string): PackLang => (language === 'cs' ? 'cs' : 'en');

const group = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const currencyLabel = (code: string | null, lang: PackLang) => {
  const c = (code ?? '').trim().toUpperCase();
  if (!c) return '';
  return c === 'CZK' && lang === 'cs' ? 'Kč' : c;
};

const PERIOD: Record<PackLang, Record<SalaryPeriod, string>> = {
  cs: { month: 'měsíčně', year: 'ročně' },
  en: { month: 'per month', year: 'per year' },
};

/** "120 000–150 000 CZK per month", "120 000–150 000 Kč měsíčně", or "Negotiable" / "Dle dohody". */
export const formatSalary = (
  p: {
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: string | null;
    salaryPeriod: SalaryPeriod | null;
  },
  lang: PackLang,
): string => {
  const { salaryMin: min, salaryMax: max } = p;
  if (min == null && max == null) return lang === 'cs' ? 'Dle dohody' : 'Negotiable';
  const amount =
    min != null && max != null
      ? min === max
        ? group(min)
        : `${group(min)}–${group(max)}`
      : min != null
        ? `${lang === 'cs' ? 'od' : 'from'} ${group(min)}`
        : `${lang === 'cs' ? 'do' : 'up to'} ${group(max as number)}`;
  return [amount, currencyLabel(p.salaryCurrency, lang), PERIOD[lang][p.salaryPeriod ?? 'month']]
    .filter(Boolean)
    .join(' ');
};

const NOTICE: Record<PackLang, Record<NoticePeriod, string>> = {
  cs: {
    immediately: 'Mohu nastoupit ihned',
    '2_weeks': '2 týdny',
    '1_month': '1 měsíc',
    '2_months': '2 měsíce',
    '3_months': '3 měsíce',
    more: 'Více než 3 měsíce',
  },
  en: {
    immediately: 'Available immediately',
    '2_weeks': '2 weeks',
    '1_month': '1 month',
    '2_months': '2 months',
    '3_months': '3 months',
    more: 'More than 3 months',
  },
};

export const formatNoticePeriod = (n: NoticePeriod | null, lang: PackLang): string =>
  n ? NOTICE[lang][n] : lang === 'cs' ? 'Dle dohody' : 'To be agreed';

/** Labels are app UI copy (English); only the answer text follows the posting language. */
export const formLabels = {
  why: 'Why this company?',
  salary: 'Salary expectations',
  notice: 'Notice period',
} as const;
