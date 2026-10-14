/** Most words a query contributes to the tsquery; more adds cost without improving matches. */
const MAX_TERMS = 8;

/**
 * Splits free text into lowercase [a-z0-9]+ words. Accents are folded first (é → e) so "Zürich"
 * still yields a usable word; everything else is a separator. Output is safe to splice into a
 * tsquery string because it can only contain [a-z0-9].
 */
export function tsqueryWords(q: string): string[] {
  return q
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, MAX_TERMS);
}

/**
 * Prefix-match tsquery for `to_tsquery('simple', …)`: every word must match the start of some
 * lexeme (`heath:* & lon:*`). Returns null when q has no usable words. Raw user text never reaches
 * to_tsquery, so operators like `!`, `|` or `:` in q cannot cause syntax errors.
 */
export function buildPrefixTsquery(q: string): string | null {
  const words = tsqueryWords(q);
  return words.length ? words.map((w) => `${w}:*`).join(' & ') : null;
}
