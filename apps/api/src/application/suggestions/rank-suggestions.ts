/** Lowercase, no diacritics: "Plzeň" → "plzen", "České Budějovice" → "ceske budejovice". */
export const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Matches `query` against candidates (own values first, then the catalog), diacritics-insensitive.
 * Order: whole-string prefix → word prefix → substring; ties keep the input order (own values win).
 * Case-insensitive duplicates are removed. Empty query → the first `limit` candidates (own values first).
 */
export function rankSuggestions(query: string, candidates: readonly string[], limit = 8): string[] {
  const q = fold(query);
  const seen = new Set<string>();
  const scored: { value: string; score: number; order: number }[] = [];

  for (const [order, value] of candidates.entries()) {
    const trimmed = value.trim();
    const key = fold(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (!q) {
      scored.push({ value: trimmed, score: 0, order });
      continue;
    }
    const wordPrefix = key.split(/[\s\-/]+/).some((w) => w.startsWith(q));
    const score = key.startsWith(q) ? 0 : wordPrefix ? 1 : key.includes(q) ? 2 : -1;
    if (score >= 0) scored.push({ value: trimmed, score, order });
  }

  return scored
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .slice(0, limit)
    .map((s) => s.value);
}
