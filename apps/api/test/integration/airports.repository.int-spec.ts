import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, milesToMeters } from '@location-search/shared';
import type { DataSource } from 'typeorm';
import type { AirportsRepository } from '../../src/airports/airports.repository.js';
import { AirportsService } from '../../src/airports/airports.service.js';
import {
  type FilterCriteria,
  referencePoint,
  type SearchCriteria,
} from '../../src/airports/search/search-criteria.js';
import type { BBox } from '../../src/geo/coordinates.js';
import { disposeTestDataSource } from '../helpers/data-source.js';
import { connectSeededDataSource, createRepository } from '../helpers/seeded.js';

// Known answers below were derived by querying the seeded GADB data directly (not from
// real-world geography), and oracles recompute results with independent brute-force SQL.

const CENTRAL_LONDON = { lat: 51.5, lng: -0.12 };
const LONDON_BOX: BBox = [-1, 51, 1, 52];
const LONDON_BOX_ICAOS = [
  'EGGW', 'EGKB', 'EGKK', 'EGLC', 'EGLF', 'EGLK', 'EGLL', 'EGMC',
  'EGRR', 'EGSS', 'EGSX', 'EGTD', 'EGTH', 'EGVO', 'EGWU',
]; // prettier-ignore

describe('AirportsRepository (seeded PostGIS)', () => {
  let ds: DataSource;
  let repo: AirportsRepository;

  const page = (criteria: Partial<SearchCriteria>): SearchCriteria => ({
    sort: 'icao',
    order: 'asc',
    page: 1,
    limit: MAX_PAGE_LIMIT,
    ...criteria,
  });

  /** Every match of a search, by walking all pages. */
  async function allPages(criteria: Partial<SearchCriteria>): Promise<string[]> {
    const icaos: string[] = [];
    for (let p = 1; ; p++) {
      const { rows, total } = await repo.search(page({ ...criteria, page: p }));
      icaos.push(...rows.map((r) => r.icao_code));
      if (icaos.length >= total || rows.length === 0) return icaos;
    }
  }

  const icaosWhere = async (where: string, params: unknown[] = []): Promise<string[]> =>
    (
      await ds.query<{ icao_code: string }[]>(
        `SELECT icao_code FROM airports WHERE ${where} ORDER BY icao_code`,
        params,
      )
    ).map((r) => r.icao_code);

  beforeAll(async () => {
    ds = await connectSeededDataSource();
    repo = createRepository(ds);
  });

  afterAll(async () => {
    await disposeTestDataSource(ds);
  });

  describe('radius', () => {
    it.each([
      [CENTRAL_LONDON, 30],
      [CENTRAL_LONDON, 250],
      [{ lat: 40.64, lng: -73.779 }, 100],
      [{ lat: -33.9, lng: 151.2 }, 1000],
      [{ lat: 0, lng: 0 }, 3000],
    ])('matches a brute-force distance oracle around %j within %d mi', async (c, radiusMi) => {
      const expected = await icaosWhere(
        `ST_Distance(geog, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) <= $3`,
        [c.lng, c.lat, milesToMeters(radiusMi)],
      );
      expect(expected.length).toBeGreaterThan(0);
      expect(await allPages({ center: { ...c, radiusMi } })).toEqual(expected);
    });

    it('finds the 9 airports within 30 mi of central London, nearest first, with distances', async () => {
      const { rows, total } = await repo.search(
        page({ center: { ...CENTRAL_LONDON, radiusMi: 30 }, sort: 'distance' }),
      );
      expect(total).toBe(9);
      expect(rows[0]).toMatchObject({ icao_code: 'EGLC' });
      const distances = rows.map((r) => r.distance_m!);
      expect(distances).toEqual([...distances].sort((a, b) => a - b));
      expect(Math.max(...distances)).toBeLessThanOrEqual(milesToMeters(30));
      expect(rows.map((r) => r.icao_code)).toContain('EGLL');
    });
  });

  describe('bbox', () => {
    it('returns the airports inside a London box', async () => {
      expect(await allPages({ bbox: LONDON_BOX })).toEqual(LONDON_BOX_ICAOS);
    });

    it.each<[string, BBox]>([
      ['equator/meridian', [-10, -10, 10, 10]],
      ['wide high-latitude', [-170, 50, 170, 80]],
      ['southern', [110, -45, 155, -10]],
      ['western hemisphere', [-180, -90, 0, 90]],
    ])('matches a planar lng/lat oracle for the %s box', async (_label, bbox) => {
      const expected = await icaosWhere(
        `ST_X(geog::geometry) BETWEEN $1 AND $3 AND ST_Y(geog::geometry) BETWEEN $2 AND $4`,
        bbox,
      );
      expect(expected.length).toBeGreaterThan(0);
      expect(await allPages({ bbox })).toEqual(expected);
    });

    it('returns everything for the whole world', async () => {
      expect((await repo.search(page({ bbox: [-180, -90, 180, 90] }))).total).toBe(4187);
    });

    it('measures distance from the box midpoint and sorts by it, matching an SQL oracle', async () => {
      // LONDON_BOX midpoint is (0, 51.5); the oracle computes ST_Distance independently.
      const oracle = await ds.query<{ icao_code: string; distance_m: number }[]>(
        `SELECT icao_code,
                ST_Distance(geog, ST_SetSRID(ST_MakePoint(0, 51.5), 4326)::geography) AS distance_m
           FROM airports
          WHERE ST_X(geog::geometry) BETWEEN -1 AND 1 AND ST_Y(geog::geometry) BETWEEN 51 AND 52
          ORDER BY distance_m, icao_code`,
      );
      const { rows } = await repo.search(page({ bbox: LONDON_BOX, sort: 'distance' }));

      expect(rows.map((r) => r.icao_code)).toEqual(oracle.map((o) => o.icao_code));
      rows.forEach((r, i) => expect(r.distance_m).toBeCloseTo(oracle[i]!.distance_m, 3));
    });

    it('returns a distance on every row of a bbox search, whatever the sort', async () => {
      const { rows, total } = await repo.search(page({ bbox: LONDON_BOX, sort: 'name' }));
      expect(rows).toHaveLength(total);
      expect(rows.every((r) => typeof r.distance_m === 'number')).toBe(true);
    });
  });

  describe('polygon', () => {
    type Pt = [number, number];
    const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

    /**
     * Independent oracle: even-odd ray casting in Web Mercator over every airport, in TypeScript
     * (no PostGIS). Airports beyond the Mercator range can't be inside a drawable polygon.
     */
    async function oracleInside(ring: Pt[]): Promise<string[]> {
      const all = await ds.query<{ icao_code: string; lat: number; lng: number }[]>(
        `SELECT icao_code, ST_Y(geog::geometry) AS lat, ST_X(geog::geometry) AS lng FROM airports`,
      );
      const poly = ring.map(([lng, lat]) => [lng, mercY(lat)] as const);
      const inside = (x: number, y: number) => {
        let hit = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [xi, yi] = poly[i]!;
          const [xj, yj] = poly[j]!;
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
        }
        return hit;
      };
      return all
        .filter((a) => Math.abs(a.lat) < 85.0511 && inside(a.lng, mercY(a.lat)))
        .map((a) => a.icao_code)
        .sort();
    }

    const londonL: Pt[] = [
      [-1, 51],
      [1, 51],
      [1, 51.4],
      [-0.2, 51.4],
      [-0.2, 52],
      [-1, 52],
    ];

    it.each<[string, Pt[]]>([
      ['concave L around London', londonL],
      [
        'diagonal triangle over France',
        [
          [-2, 43],
          [7, 46],
          [1, 50.5],
        ],
      ],
      [
        'large irregular polygon over Europe',
        [
          [-10, 36],
          [20, 35],
          [30, 45],
          [25, 60],
          [5, 62],
          [-8, 55],
        ],
      ],
      [
        'far south (near the Mercator limit)',
        [
          [-180, -85.05],
          [180, -85.05],
          [180, -60],
          [-180, -60],
        ],
      ],
    ])('matches a Web Mercator ray-casting oracle: %s', async (_label, ring) => {
      const expected = await oracleInside(ring);
      expect(expected.length).toBeGreaterThan(0); // a non-empty answer, so the match means something
      expect(await allPages({ polygon: ring })).toEqual(expected);
    });

    it('excludes the concave notch that a bounding box would include', async () => {
      const inL = await allPages({ polygon: londonL });
      const inBox = await allPages({ bbox: [-1, 51, 1, 52] });
      expect(inL.length).toBeGreaterThan(0);
      expect(inL.length).toBeLessThan(inBox.length);
      expect(inBox).toEqual(expect.arrayContaining(inL));
    });

    it('never transforms polar airports (the South Pole station sits inside the lng/lat box)', async () => {
      // Box spans to -90 on the lng/lat side; Mercator can't represent it. Must not error.
      const ring: Pt[] = [
        [-10, -85.05],
        [10, -85.05],
        [10, -80],
        [-10, -80],
      ];
      await expect(repo.search(page({ polygon: ring }))).resolves.toMatchObject({ total: 0 });
    });

    it('measures distance from the Web Mercator centroid and sorts by it', async () => {
      const centroid = referencePoint({ polygon: londonL })!;
      const oracle = (
        await ds.query<{ icao_code: string }[]>(
          `SELECT icao_code FROM airports WHERE icao_code = ANY($1)
            ORDER BY ST_Distance(geog, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography), icao_code`,
          [await oracleInside(londonL), centroid.lng, centroid.lat],
        )
      ).map((r) => r.icao_code);
      const { rows } = await repo.search(page({ polygon: londonL, sort: 'distance' }));
      expect(rows.map((r) => r.icao_code)).toEqual(oracle);
      expect(rows.every((r) => typeof r.distance_m === 'number')).toBe(true);
    });
  });

  describe('nearest (KNN)', () => {
    it('returns the k closest other airports with spheroidal distances', async () => {
      const rows = await repo.nearest('EGLL', 5);
      expect(rows.map((r) => r.icao_code)).toEqual(['EGWU', 'EGRR', 'EGLF', 'EGLK', 'EGLC']);
      const service = new AirportsService(repo);
      const { data } = await service.nearest('EGLL', 5);
      expect(data.map((a) => a.distanceMi)).toEqual([5.6, 15.4, 19.5, 19.8, 22.3]);
    });

    it('agrees with a brute-force ordering for k = 50', async () => {
      const expected = (
        await ds.query<{ icao_code: string }[]>(
          `SELECT icao_code FROM airports
            WHERE icao_code <> 'KJFK'
            ORDER BY ST_Distance(geog, (SELECT geog FROM airports WHERE icao_code = 'KJFK')), icao_code
            LIMIT 50`,
        )
      ).map((r) => r.icao_code);
      expect((await repo.nearest('KJFK', 50)).map((r) => r.icao_code)).toEqual(expected);
    });

    it('returns nothing for an unknown origin', async () => {
      expect(await repo.nearest('ZZZZ', 5)).toEqual([]);
    });
  });

  describe('distance', () => {
    it('measures EGLL → KJFK and flags unknown codes', async () => {
      const service = new AirportsService(repo);
      expect(await service.distance('EGLL', 'KJFK')).toEqual({
        from: 'EGLL',
        to: 'KJFK',
        distanceMi: 3451.3,
      });
      expect(await repo.distance('EGLL', 'ZZZZ')).toEqual({
        hasFrom: true,
        hasTo: false,
        meters: null,
      });
      expect((await repo.distance('EGLL', 'EGLL')).meters).toBe(0);
    });
  });

  describe('text search', () => {
    const search = (q: string, extra: Partial<SearchCriteria> = {}) =>
      repo.search(page({ q, sort: 'relevance', order: 'desc', ...extra }));

    it('ranks an exact IATA or ICAO code first', async () => {
      expect((await search('LHR')).rows[0]?.icao_code).toBe('EGLL');
      expect((await search('lhr')).rows[0]?.icao_code).toBe('EGLL');
      expect((await search('kjfk')).rows[0]?.icao_code).toBe('KJFK');
    });

    it('returns both airports sharing a duplicated IATA code', async () => {
      const icaos = (await search('MNL')).rows.slice(0, 2).map((r) => r.icao_code);
      expect(icaos.sort()).toEqual(['RPLL', 'RPMM']);
    });

    it('prefix-matches words: "heath" finds Heathrow', async () => {
      const icaos = (await search('heath')).rows.map((r) => r.icao_code);
      expect(icaos).toContain('EGLL');
    });

    it('tolerates typos: "heathrw" finds Heathrow first', async () => {
      expect((await search('heathrw')).rows[0]?.icao_code).toBe('EGLL');
    });

    it('"london" finds the London airports', async () => {
      const icaos = (await search('london')).rows.map((r) => r.icao_code);
      expect(icaos).toEqual(
        expect.arrayContaining(['EGLL', 'EGKK', 'EGGW', 'EGSS', 'EGLC', 'CYXU']),
      );
    });

    it('matches multi-word queries on every word', async () => {
      const icaos = (await search('ninoy aquino')).rows.map((r) => r.icao_code);
      expect(icaos[0]).toBe('RPLL');
    });

    it('is safe with tsquery syntax and quotes in q', async () => {
      for (const q of ["o'hare", 'a & | ! :* (', "'; DROP TABLE airports; --", '***']) {
        await expect(search(q)).resolves.toBeDefined();
      }
      expect((await ds.query(`SELECT count(*)::int AS n FROM airports`))[0].n).toBe(4187);
    });
  });

  describe('filters', () => {
    it('country is an exact match on any of the given values', async () => {
      expect((await repo.search(page({ countries: ['France'] }))).total).toBe(191);
      expect((await repo.search(page({ countries: ['France', 'Spain'] }))).total).toBe(237);
      expect((await repo.search(page({ countries: ['france'] }))).total).toBe(0);
      // Source typo kept as-is: Heathrow's country is "Engalnd".
      expect(
        (await repo.search(page({ countries: ['Engalnd'] }))).rows.map((r) => r.icao_code),
      ).toEqual(['EGLL']);
    });

    it('iata and hasIata', async () => {
      expect((await repo.search(page({ iata: 'LHR' }))).rows.map((r) => r.icao_code)).toEqual([
        'EGLL',
      ]);
      expect((await repo.search(page({ hasIata: false }))).total).toBe(1239);
      expect((await repo.search(page({ hasIata: true }))).total).toBe(4187 - 1239);
    });

    it('altitude bounds are inclusive', async () => {
      const iceland = (min?: number, max?: number) =>
        allPages({ countries: ['Iceland'], minAltitudeFt: min, maxAltitudeFt: max });
      expect(await iceland(13, 13)).toEqual(['BIPA', 'BISI']);
      expect(await iceland(79)).toEqual(['BIEG', 'BIKF', 'BIVM']);
      expect(await iceland(undefined, 10)).toEqual(['BIAR', 'BIIS']);
    });

    it('combines q + country + altitude + radius with AND', async () => {
      const criteria: FilterCriteria = {
        q: 'london',
        countries: ['England'],
        minAltitudeFt: 0,
        maxAltitudeFt: 300,
        center: { ...CENTRAL_LONDON, radiusMi: 50 },
      };
      expect(await allPages(criteria)).toEqual(['EGKK', 'EGLC']);
      const relevance = await repo.search(page({ ...criteria, sort: 'relevance', order: 'desc' }));
      expect(relevance.total).toBe(2);
      expect(relevance.rows.every((r) => r.distance_m !== undefined)).toBe(true);
    });
  });

  describe('/points parity', () => {
    it.each<[string, FilterCriteria]>([
      ['no filters', {}],
      ['country', { countries: ['France', 'Spain'] }],
      ['text', { q: 'international' }],
      ['radius + altitude', { center: { ...CENTRAL_LONDON, radiusMi: 250 }, maxAltitudeFt: 500 }],
      ['bbox + hasIata', { bbox: [-10, 35, 5, 60], hasIata: true }],
      [
        'polygon + text',
        {
          polygon: [
            [-10, 36],
            [20, 35],
            [30, 45],
            [25, 60],
            [5, 62],
            [-8, 55],
          ],
          q: 'international',
        },
      ],
    ])('returns the same set as the paginated list (%s)', async (_label, criteria) => {
      const points = await repo.points(criteria);
      const { total } = await repo.search(page({ ...criteria, limit: 1 }));
      expect(points).toHaveLength(total);
      expect(points.map((p) => p.icao_code)).toEqual(await allPages(criteria));
      expect(points[0]).toEqual({
        icao_code: expect.any(String),
        lat: expect.any(Number),
        lng: expect.any(Number),
      });
    });
  });

  describe('sorting and pagination', () => {
    it.each<[SearchCriteria['sort'], SearchCriteria['order'], Partial<SearchCriteria>]>([
      ['altitude', 'asc', { countries: ['France', 'Spain'] }],
      ['altitude', 'desc', { countries: ['France', 'Spain'] }],
      ['name', 'asc', { countries: ['France', 'Spain'] }],
      ['distance', 'asc', { center: { ...CENTRAL_LONDON, radiusMi: 300 } }],
      ['relevance', 'desc', { q: 'london' }],
    ])(
      'pages by %s %s are disjoint, complete and match one big page',
      async (sort, order, extra) => {
        const one = await repo.search(page({ ...extra, sort, order, limit: MAX_PAGE_LIMIT }));
        expect(one.total).toBeLessThanOrEqual(MAX_PAGE_LIMIT * 3);
        const all: string[] = [];
        for (let p = 1; p <= Math.ceil(one.total / 7); p++) {
          const { rows } = await repo.search(page({ ...extra, sort, order, page: p, limit: 7 }));
          all.push(...rows.map((r) => r.icao_code));
        }
        const big = await allPages({ ...extra, sort, order });
        expect(all).toEqual(big);
        expect(new Set(all).size).toBe(one.total);
      },
    );

    it('orders by the requested field and breaks ties on ICAO', async () => {
      const { rows } = await repo.search(
        page({ countries: ['France'], sort: 'altitude', order: 'desc', limit: DEFAULT_PAGE_LIMIT }),
      );
      for (let i = 1; i < rows.length; i++) {
        const [a, b] = [rows[i - 1]!, rows[i]!];
        expect(a.altitude_ft).toBeGreaterThanOrEqual(b.altitude_ft);
        if (a.altitude_ft === b.altitude_ft) expect(a.icao_code < b.icao_code).toBe(true);
      }
    });

    it('returns an empty page past the end but still reports the total', async () => {
      const result = await repo.search(page({ countries: ['Iceland'], page: 99, limit: 10 }));
      expect(result).toEqual({ rows: [], total: 11 });
    });
  });

  describe('countries', () => {
    it('lists each country once with counts that add up to every airport', async () => {
      const countries = await repo.countries();
      expect(countries).toHaveLength(215);
      expect(countries.reduce((sum, c) => sum + c.count, 0)).toBe(4187);
      expect(countries).toContainEqual({ country: 'France', count: 191 });
      expect(countries).toContainEqual({ country: 'Engalnd', count: 1 });
      const names = countries.map((c) => c.country);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  describe('findByIcao', () => {
    it('maps lat/lng from the geography and returns null when unknown', async () => {
      expect(await repo.findByIcao('KJFK')).toMatchObject({
        icao_code: 'KJFK',
        lat: 40.64,
        lng: -73.779,
      });
      expect(await repo.findByIcao('ZZZZ')).toBeNull();
    });
  });
});
