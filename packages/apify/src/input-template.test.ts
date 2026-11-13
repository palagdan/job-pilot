import { describe, expect, it } from 'vitest';
import { fillInputTemplate, templatePlaceholders } from './input-template.ts';

describe('fillInputTemplate', () => {
  it('keeps numbers raw for whole-string placeholders and interpolates inline ones', () => {
    expect(
      fillInputTemplate(
        { max: '{{maxItems}}', label: 'top {{maxItems}} since {{since}}' },
        { maxItems: 3, since: 'x' },
      ),
    ).toEqual({ max: 3, label: 'top 3 since x' });
  });

  it('walks nested arrays and objects', () => {
    expect(
      fillInputTemplate(
        { startUrls: ['https://a', '{{u}}'], o: { n: [{ m: '{{maxItems}}' }] }, k: true },
        { u: 'https://b', maxItems: 9 },
      ),
    ).toEqual({ startUrls: ['https://a', 'https://b'], o: { n: [{ m: 9 }] }, k: true });
  });

  it('throws on unknown placeholders', () => {
    expect(() => fillInputTemplate({ a: '{{nope}}' }, {})).toThrow(/nope/);
    expect(() => fillInputTemplate({ a: 'x {{nope}}' }, {})).toThrow(/nope/);
  });

  it('lists placeholders', () => {
    expect(templatePlaceholders({ a: ['{{x}}', { b: 'y {{z}}' }] })).toEqual(new Set(['x', 'z']));
  });
});
