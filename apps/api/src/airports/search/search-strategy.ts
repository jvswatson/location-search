import type { SqlParams } from '../../common/sql-params.js';

/**
 * SQL produced by a search strategy for a free-text query. Expressions refer to the `airports`
 * table as alias `a`; any values are bound through the SqlParams passed in.
 */
export interface SearchClause {
  /** Boolean predicate an airport must satisfy to match q. */
  whereSql: string;
  /** Relevance expressions, most significant first; each is sorted descending (best first). */
  rankSql: string[];
}

/**
 * The seam for how free text matches and ranks airports. v1 is lexical (`TextSearchStrategy`); a
 * later strategy (e.g. vector similarity) can be swapped in via SEARCH_STRATEGY without touching
 * the repository or service.
 */
export interface SearchStrategy {
  apply(params: SqlParams, q: string): SearchClause;
}

export const SEARCH_STRATEGY = Symbol('SEARCH_STRATEGY');
