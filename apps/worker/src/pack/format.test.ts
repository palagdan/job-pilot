import { describe, expect, it } from 'vitest';
import { formatNoticePeriod, formatSalary, packLang, postingLanguage } from './format.ts';

const base = { salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null };

describe('formatSalary', () => {
  it('formats a range in English', () => {
    expect(
      formatSalary(
        { salaryMin: 120000, salaryMax: 150000, salaryCurrency: 'CZK', salaryPeriod: 'month' },
        'en',
      ),
    ).toBe('120 000–150 000 CZK per month');
  });
  it('formats a range in Czech with Kč', () => {
    expect(
      formatSalary(
        { salaryMin: 120000, salaryMax: 150000, salaryCurrency: 'CZK', salaryPeriod: 'month' },
        'cs',
      ),
    ).toBe('120 000–150 000 Kč měsíčně');
  });
  it('handles one-sided and equal values and yearly period', () => {
    expect(formatSalary({ ...base, salaryMin: 90000, salaryCurrency: 'EUR' }, 'en')).toBe(
      'from 90 000 EUR per month',
    );
    expect(
      formatSalary(
        { ...base, salaryMax: 90000, salaryCurrency: 'CZK', salaryPeriod: 'year' },
        'cs',
      ),
    ).toBe('do 90 000 Kč ročně');
    expect(formatSalary({ ...base, salaryMin: 5, salaryMax: 5 }, 'en')).toBe('5 per month');
  });
  it('falls back when missing', () => {
    expect(formatSalary(base, 'en')).toBe('Negotiable');
    expect(formatSalary(base, 'cs')).toBe('Dle dohody');
  });
});

describe('formatNoticePeriod', () => {
  it('is readable in cs and en', () => {
    expect(formatNoticePeriod('2_months', 'en')).toBe('2 months');
    expect(formatNoticePeriod('2_months', 'cs')).toBe('2 měsíce');
    expect(formatNoticePeriod('immediately', 'en')).toBe('Available immediately');
    expect(formatNoticePeriod(null, 'en')).toBe('To be agreed');
    expect(formatNoticePeriod(null, 'cs')).toBe('Dle dohody');
  });
});

describe('language', () => {
  it('prefers the stored language, else detects Czech, else en', () => {
    expect(postingLanguage('CS', 'x')).toBe('cs');
    expect(postingLanguage(null, 'Hledáme šikovného vývojáře do týmu')).toBe('cs');
    expect(postingLanguage(null, 'We are hiring')).toBe('en');
    expect(packLang('de')).toBe('en');
    expect(packLang('cs')).toBe('cs');
  });
});
