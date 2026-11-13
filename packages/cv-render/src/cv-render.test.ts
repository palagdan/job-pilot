import { cvFileBaseName, cvFileName } from '@job-pilot/shared/cv-file-name';
import mammoth from 'mammoth';
import { extractText } from 'unpdf';
import { describe, expect, it } from 'vitest';
import { cvContentHash } from './content-hash.ts';
import { fixtureCv } from './fixture-cv.ts';
import { formatPeriod } from './format.ts';
import { renderCvDocx } from './render-docx.ts';
import { renderCvPdf } from './render-pdf.ts';

/** Phrases that must be machine-readable in both formats (the worker's own extractors are used: unpdf, mammoth). */
const mustContain = [
  'Řehoř Dvořák',
  'Plzeň, Czechia',
  'Head of Performance Marketing — Škoda Digital',
  'Mar 2021 – Present',
  'Jun 2016 – Feb 2021',
  'cut blended CAC by 23%',
  'Vysoká škola ekonomická v Praze',
  'Czech (Native) · English (Professional)',
  'SUMMARY',
  'EXPERIENCE',
  'SKILLS',
];

describe('renderCvPdf', () => {
  it('produces a text PDF with every phrase readable (Czech diacritics included)', {
    timeout: 20_000,
  }, async () => {
    const { bytes, pageCount } = await renderCvPdf(fixtureCv);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(pageCount).toBe(1);
    const { text } = await extractText(bytes, { mergePages: true });
    const flat = text.replace(/\s+/g, ' ');
    for (const phrase of mustContain) expect(flat).toContain(phrase);
  });
});

describe('renderCvDocx', () => {
  it('produces a DOCX with the same content', async () => {
    const { bytes } = await renderCvDocx(fixtureCv);
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b]); // zip
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    const flat = value.replace(/\s+/g, ' ');
    for (const phrase of mustContain) expect(flat).toContain(phrase);
  });
});

describe('file names (spec "Download format")', () => {
  it('master: Name_CV_JobPilot_vN', () => {
    expect(
      cvFileName(cvFileBaseName({ kind: 'master', fullName: 'User Name', version: 1 }), 'pdf'),
    ).toBe('User_Name_CV_JobPilot_v1.pdf');
    expect(cvFileBaseName({ kind: 'master', fullName: 'Řehoř  Dvořák', version: 3 })).toBe(
      'Řehoř_Dvořák_CV_JobPilot_v3',
    );
    expect(cvFileBaseName({ kind: 'master', fullName: null, version: 1 })).toBe(
      'My_CV_JobPilot_v1',
    );
  });

  it('special: CV - Company - Role, unsafe characters removed', () => {
    expect(
      cvFileName(
        cvFileBaseName({ kind: 'special', company: 'Company A', role: 'Head of Growth' }),
        'docx',
      ),
    ).toBe('CV - Company A - Head of Growth.docx');
    expect(cvFileBaseName({ kind: 'special', company: 'A/B: "Test"', role: 'CMO?' })).toBe(
      'CV - A B Test - CMO',
    );
  });
});

describe('cvContentHash', () => {
  it('is stable for the same content regardless of key order, changes with content', () => {
    const reverseKeys = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(reverseKeys)
        : v && typeof v === 'object'
          ? Object.fromEntries(
              Object.entries(v)
                .reverse()
                .map(([k, x]) => [k, reverseKeys(x)]),
            )
          : v;
    const reordered = reverseKeys(fixtureCv) as typeof fixtureCv;
    expect(Object.keys(reordered)[0]).toBe('projects');
    expect(cvContentHash(reordered)).toBe(cvContentHash(fixtureCv));
    expect(cvContentHash({ ...fixtureCv, summary: 'Changed' })).not.toBe(cvContentHash(fixtureCv));
    expect(cvContentHash(fixtureCv)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('formatPeriod', () => {
  it('handles open-ended and missing dates', () => {
    expect(formatPeriod('2021-03', null)).toBe('Mar 2021 – Present');
    expect(formatPeriod(null, null)).toBe('');
    expect(formatPeriod(null, '2019-06')).toBe('Jun 2019');
  });
});
