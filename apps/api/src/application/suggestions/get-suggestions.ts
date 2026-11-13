import type { Suggestion } from '@job-pilot/shared/targets';
import type { CvFactsReader } from '../ports/cv-facts-reader.ts';
import { locationCatalog, roleCatalog, skillCatalog } from './catalog.ts';
import { rankSuggestions } from './rank-suggestions.ts';

/**
 * GET /v1/suggestions?kind=roles|locations|skills&q=… — tag input suggestions (spec §1).
 * The user's own CV/profile values come first, then the curated catalog. No LLM call per keystroke:
 * the CV was already structured by the worker's cv.parse job.
 */
export async function getSuggestions(
  deps: { cvFacts: CvFactsReader },
  userId: string,
  query: { kind: Suggestion; q: string },
): Promise<{ items: string[] }> {
  const facts = await deps.cvFacts.forUser(userId);
  const candidates =
    query.kind === 'roles'
      ? [...facts.titles, ...roleCatalog]
      : query.kind === 'skills'
        ? [...facts.skills, ...skillCatalog]
        : [...facts.locations, ...locationCatalog];
  return { items: rankSuggestions(query.q, candidates) };
}
