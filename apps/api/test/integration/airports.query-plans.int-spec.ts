import type { DataSource, QueryRunner } from 'typeorm';
import { AirportsRepository } from '../../src/airports/airports.repository.js';
import type { SearchCriteria } from '../../src/airports/search/search-criteria.js';
import { TextSearchStrategy } from '../../src/airports/search/text-search.strategy.js';
import { disposeTestDataSource } from '../helpers/data-source.js';
import { connectSeededDataSource } from '../helpers/seeded.js';

/**
 * Checks that the repository's real SQL can use the intended indexes. With only ~4k rows the
 * planner would often (rightly) prefer a sequential scan, so seq scans are disabled on one
 * dedicated connection: if a query still cannot use the index, the plan shows it.
 */
describe('query plans', () => {
  let ds: DataSource;
  let runner: QueryRunner;
  /** A repository whose queries are EXPLAINed on `runner` instead of executed. */
  let explaining: AirportsRepository;
  let plans: string[];

  beforeAll(async () => {
    ds = await connectSeededDataSource();
    await ds.query('ANALYZE airports');
    runner = ds.createQueryRunner();
    await runner.connect();
    await runner.query('SET enable_seqscan = off');

    const explainDs = {
      query: async (sql: string, params?: unknown[]) => {
        const rows = await runner.query(`EXPLAIN (FORMAT TEXT) ${sql}`, params);
        plans.push(rows.map((r: { 'QUERY PLAN': string }) => r['QUERY PLAN']).join('\n'));
        return [];
      },
    } as unknown as DataSource;
    explaining = new AirportsRepository(explainDs, new TextSearchStrategy());
  });

  beforeEach(() => {
    plans = [];
  });

  afterAll(async () => {
    await runner?.release();
    await disposeTestDataSource(ds);
  });

  const criteria = (c: Partial<SearchCriteria>): SearchCriteria => ({
    sort: 'name',
    order: 'asc',
    page: 1,
    limit: 25,
    ...c,
  });

  it('radius search uses the GIST index (list and count)', async () => {
    await explaining.search(criteria({ center: { lat: 51.5, lng: -0.12, radiusMi: 30 } }));
    expect(plans).toHaveLength(2);
    for (const plan of plans) expect(plan).toContain('airports_geog_gist');
  });

  it('bbox search uses the GIST index', async () => {
    await explaining.points({ bbox: [-1, 51, 1, 52] });
    expect(plans[0]).toContain('airports_geog_gist');
  });

  it('polygon search uses the GIST index', async () => {
    const square = [
      [-1, 51],
      [1, 51],
      [1, 52],
      [-1, 52],
      [-1, 51],
    ];
    await explaining.within(JSON.stringify({ type: 'Polygon', coordinates: [square] }));
    expect(plans[0]).toContain('airports_geog_gist');
  });

  it('nearest uses an index-ordered KNN scan', async () => {
    await explaining.nearest('EGLL', 5);
    expect(plans[0]).toMatch(
      /Index Scan using airports_geog_gist on airports a[^\n]*\n\s+Order By: \(geog <->/,
    );
  });

  it('text search uses the full-text GIN and both trigram GIN indexes', async () => {
    await explaining.search(criteria({ q: 'heathrow', sort: 'relevance', order: 'desc' }));
    for (const plan of plans) {
      expect(plan).toContain('airports_search_vector_gin');
      expect(plan).toContain('airports_name_trgm');
      expect(plan).toContain('airports_city_trgm');
      expect(plan).not.toContain('Seq Scan');
    }
  });

  it('combined filters still avoid a sequential scan', async () => {
    await explaining.search(
      criteria({
        q: 'london',
        countries: ['England'],
        maxAltitudeFt: 300,
        center: { lat: 51.5, lng: -0.12, radiusMi: 50 },
      }),
    );
    for (const plan of plans) expect(plan).not.toContain('Seq Scan');
  });
});
