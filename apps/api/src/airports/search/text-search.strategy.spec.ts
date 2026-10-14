import { SqlParams } from '../../common/sql-params.js';
import { TextSearchStrategy } from './text-search.strategy.js';

describe('TextSearchStrategy', () => {
  const strategy = new TextSearchStrategy();

  it('binds the uppercased code, the raw text and the sanitized tsquery as parameters', () => {
    const params = new SqlParams();
    params.add('earlier'); // placeholders continue from whatever is already bound
    const clause = strategy.apply(params, 'heath row');

    expect(params.values).toEqual(['earlier', 'HEATH ROW', 'heath row', 'heath:* & row:*']);
    expect(clause.whereSql).toContain('a.icao_code = $2 OR a.iata_code = $2');
    expect(clause.whereSql).toContain(`a.search_vector @@ to_tsquery('simple', $4)`);
    expect(clause.whereSql).toContain('$3 <% a.name OR $3 <% a.city');
  });

  it('ranks exact code, then full-text rank, then trigram similarity', () => {
    const { rankSql } = strategy.apply(new SqlParams(), 'lhr');
    expect(rankSql).toHaveLength(3);
    expect(rankSql[0]).toMatch(/^coalesce\(\(a\.icao_code = \$1 OR a\.iata_code = \$1\), false\)$/);
    expect(rankSql[1]).toMatch(/^ts_rank\(a\.search_vector, to_tsquery\('simple', \$3\)\)$/);
    expect(rankSql[2]).toMatch(/word_similarity\(\$2, a\.name\)/);
  });

  it('never splices user text into the SQL', () => {
    const q = "x'); DROP TABLE airports; --";
    const params = new SqlParams();
    const { whereSql, rankSql } = strategy.apply(params, q);
    expect(`${whereSql} ${rankSql.join(' ')}`).not.toContain('DROP');
    expect(params.values).toContain(q);
  });

  it('skips full-text matching when q has no usable words', () => {
    const params = new SqlParams();
    const clause = strategy.apply(params, '***');
    expect(params.values).toEqual(['***', '***']);
    expect(clause.whereSql).not.toContain('to_tsquery');
    expect(clause.rankSql).toHaveLength(2);
  });
});
