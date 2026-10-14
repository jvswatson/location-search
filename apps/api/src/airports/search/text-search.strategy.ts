import { Injectable } from '@nestjs/common';
import type { SqlParams } from '../../common/sql-params.js';
import type { SearchClause, SearchStrategy } from './search-strategy.js';
import { buildPrefixTsquery } from './tsquery.js';

/**
 * v1 lexical search. An airport matches when any of these hold:
 *  1. q is exactly its ICAO or IATA code (case-insensitive)      → btree / unique index
 *  2. every word of q prefixes a word of its codes/name/city/country → GIN on search_vector
 *  3. q is fuzzily similar to a word run in its name or city (typos) → GIN trigram indexes
 *
 * Ranked by exact code match, then ts_rank, then trigram word similarity.
 */
@Injectable()
export class TextSearchStrategy implements SearchStrategy {
  apply(params: SqlParams, q: string): SearchClause {
    const code = params.add(q.toUpperCase());
    const text = params.add(q);
    const tsquery = buildPrefixTsquery(q);

    const codeMatch = `(a.icao_code = ${code} OR a.iata_code = ${code})`;
    // As a sort key it must never be NULL (iata_code is nullable, and NULLs sort first in DESC).
    const codeRank = `coalesce(${codeMatch}, false)`;
    // `<%` is word_similarity(q, col) >= pg_trgm.word_similarity_threshold (0.6) and is
    // index-supported by gin_trgm_ops, unlike calling word_similarity() in WHERE.
    const fuzzyMatch = `(${text} <% a.name OR ${text} <% a.city)`;
    const fuzzyRank = `greatest(word_similarity(${text}, a.name), word_similarity(${text}, a.city))`;

    if (!tsquery) {
      return { whereSql: `(${codeMatch} OR ${fuzzyMatch})`, rankSql: [codeRank, fuzzyRank] };
    }

    const tsq = `to_tsquery('simple', ${params.add(tsquery)})`;
    return {
      whereSql: `(${codeMatch} OR a.search_vector @@ ${tsq} OR ${fuzzyMatch})`,
      rankSql: [codeRank, `ts_rank(a.search_vector, ${tsq})`, fuzzyRank],
    };
  }
}
