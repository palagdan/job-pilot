import { describe, expect, it } from 'vitest';
import { getSuggestions } from './get-suggestions.ts';
import { fold, rankSuggestions } from './rank-suggestions.ts';

describe('rankSuggestions', () => {
  it('ignores diacritics and case', () => {
    expect(fold('České Budějovice')).toBe('ceske budejovice');
    expect(rankSuggestions('plzen', ['Prague', 'Plzeň'])).toEqual(['Plzeň']);
    expect(rankSuggestions('ceske', ['České Budějovice'])).toEqual(['České Budějovice']);
  });

  it('ranks prefix, then word prefix, then substring; keeps input order on ties', () => {
    const items = [
      'Product Marketing Manager',
      'Head of Growth',
      'Growth Director',
      'VP Growth',
      'Head of Growth Marketing',
    ];
    expect(rankSuggestions('growth', items)).toEqual([
      'Growth Director',
      'Head of Growth',
      'VP Growth',
      'Head of Growth Marketing',
    ]);
    expect(rankSuggestions('head of g', items)).toEqual([
      'Head of Growth',
      'Head of Growth Marketing',
    ]);
    expect(rankSuggestions('rowt', items)).toEqual([
      'Head of Growth',
      'Growth Director',
      'VP Growth',
      'Head of Growth Marketing',
    ]);
  });

  it('removes duplicates and limits results; empty query returns the first candidates', () => {
    expect(rankSuggestions('', ['CMO', 'cmo', 'Head of Growth'], 2)).toEqual([
      'CMO',
      'Head of Growth',
    ]);
    expect(rankSuggestions('x', ['a', 'b'])).toEqual([]);
  });
});

describe('getSuggestions', () => {
  const cvFacts = {
    forUser: async () => ({
      titles: ['Head of Performance Marketing', 'Senior PPC Lead'],
      skills: ['Programmatic buying'],
      locations: ['Prague, Czechia'],
    }),
  };

  it('puts the user’s own CV values before the catalog', async () => {
    const roles = await getSuggestions({ cvFacts }, 'u', { kind: 'roles', q: 'head of p' });
    expect(roles.items[0]).toBe('Head of Performance Marketing');
    expect(roles.items).toContain('Head of Product');
    const skills = await getSuggestions({ cvFacts }, 'u', { kind: 'skills', q: 'program' });
    expect(skills.items).toEqual(['Programmatic buying', 'Programmatic']);
  });

  it('offers the remote options from the spec', async () => {
    const remote = await getSuggestions({ cvFacts }, 'u', { kind: 'locations', q: 'remote' });
    expect(remote.items).toEqual(expect.arrayContaining(['Remote EU', 'Remote worldwide']));
    const empty = await getSuggestions({ cvFacts }, 'u', { kind: 'locations', q: '' });
    expect(empty.items[0]).toBe('Prague, Czechia');
  });
});
