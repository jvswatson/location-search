import {
  type AirportFeatureCollection,
  DEFAULT_PAGE_LIMIT,
  type ErrorResponse,
  MAX_COUNTRIES,
  MAX_REQUEST_URL_LENGTH,
  GEOJSON_MEDIA_TYPE,
  type Paginated,
  type AirportDto,
  type PointFeatureCollection,
  type PointsResponse,
} from '@location-search/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp, type TestApp } from '../helpers/app.js';

// Expected values were derived by querying the seeded dataset.

describe('airports API (e2e)', () => {
  let t: TestApp;
  let http: App;
  const api = '/api/v1';

  beforeAll(async () => {
    t = await createTestApp();
    http = t.app.getHttpServer();
  });

  afterAll(async () => {
    await t?.close();
  });

  const expectError = (body: ErrorResponse, statusCode: number) => {
    expect(body).toEqual({
      statusCode,
      error: expect.any(String),
      message: expect.anything(),
    });
    expect(Object.keys(body).sort()).toEqual(['error', 'message', 'statusCode']);
  };

  describe('GET /airports', () => {
    it('lists by name with default pagination', async () => {
      const res = await request(http).get(`${api}/airports`).expect(200);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      const body = res.body as Paginated<AirportDto>;
      expect(body.meta).toEqual({
        total: 4187,
        page: 1,
        limit: DEFAULT_PAGE_LIMIT,
        pageCount: Math.ceil(4187 / DEFAULT_PAGE_LIMIT),
      });
      expect(body.data).toHaveLength(DEFAULT_PAGE_LIMIT);
      expect(body.data[0]).not.toHaveProperty('distanceMi');
    });

    it('measures and sorts by distance from the bbox midpoint, reported as meta.center', async () => {
      const res = await request(http)
        .get(`${api}/airports`)
        .query({ bbox: '-1,51,1,52' })
        .expect(200);
      const body = res.body as Paginated<AirportDto>;
      expect(body.meta).toEqual({
        total: 15,
        page: 1,
        limit: DEFAULT_PAGE_LIMIT,
        pageCount: 1,
        center: { lat: 51.5, lng: 0 },
      });
      const distances = body.data.map((a) => a.distanceMi!);
      expect(distances.every((d) => typeof d === 'number')).toBe(true);
      expect(distances).toEqual([...distances].sort((a, b) => a - b));
    });

    it('reports the radius center as meta.center too', async () => {
      const res = await request(http)
        .get(`${api}/airports`)
        .query({ lat: 51.5, lng: -0.12, radiusMi: 10 })
        .expect(200);
      expect(res.body.meta.center).toEqual({ lat: 51.5, lng: -0.12 });
    });

    it('accepts exactly the maximum number of countries', async () => {
      const country = Array.from({ length: MAX_COUNTRIES }, (_, i) => `Country ${i}`);
      const res = await request(http).get(`${api}/airports`).query({ country }).expect(200);
      expect(res.body.meta.total).toBe(0);
    });

    it('searches text and ranks the exact code first', async () => {
      const res = await request(http).get(`${api}/airports`).query({ q: 'lhr' }).expect(200);
      expect(res.body.data[0]).toEqual({
        icaoCode: 'EGLL',
        iataCode: 'LHR',
        name: 'Heathrow',
        city: 'London',
        country: 'Engalnd',
        altitudeFt: 82,
        lat: 51.477,
        lng: -0.461,
      });
    });

    it('combines q, repeated country, altitude and radius, with distances', async () => {
      const res = await request(http)
        .get(
          `${api}/airports?q=london&country=England&country=Engalnd&maxAltitudeFt=300&lat=51.5&lng=-0.12&radiusMi=50&sort=distance`,
        )
        .expect(200);
      const body = res.body as Paginated<AirportDto>;
      expect(body.data.map((a) => a.icaoCode)).toEqual(['EGLC', 'EGLL', 'EGKK']);
      expect(body.data.map((a) => a.distanceMi)).toEqual([7.5, 14.8, 24.5]);
      expect(body.meta).toEqual({
        total: 3,
        page: 1,
        limit: DEFAULT_PAGE_LIMIT,
        pageCount: 1,
        center: { lat: 51.5, lng: -0.12 },
      });
    });

    it('pages with stable meta', async () => {
      const res = await request(http)
        .get(`${api}/airports`)
        .query({ country: 'France', page: 4, limit: 50, sort: 'altitude' })
        .expect(200);
      expect(res.body.meta).toEqual({ total: 191, page: 4, limit: 50, pageCount: 4 });
      expect(res.body.data).toHaveLength(41);
    });

    it('returns GeoJSON for format=geojson', async () => {
      const res = await request(http)
        .get(`${api}/airports`)
        .query({ iata: 'LHR', format: 'geojson' })
        .expect(200);
      expect(res.headers['content-type']).toMatch(/^application\/geo\+json/);
      const body = JSON.parse(res.text) as AirportFeatureCollection;
      expect(body).toEqual({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [-0.461, 51.477] },
            properties: expect.objectContaining({ icaoCode: 'EGLL', name: 'Heathrow' }),
          },
        ],
        meta: { total: 1, page: 1, limit: DEFAULT_PAGE_LIMIT, pageCount: 1 },
      });
      expect(body.features[0]!.properties).not.toHaveProperty('lat');
    });

    it.each([
      [{ lat: '51.5' }, /lat, lng and radiusMi must be given together/],
      [{ sort: 'relevance' }, /sort=relevance requires q/],
      [{ sort: 'distance' }, /sort=distance requires/],
      [{ radiusMi: '5000', lat: '0', lng: '0' }, /radiusMi must not be greater than 3000/],
      [{ bbox: '10,0,5,5' }, /minLng must be less than maxLng/],
      [{ minAltitudeFt: '10', maxAltitudeFt: '5' }, /minAltitudeFt must be less than or equal/],
      [{ limit: '101' }, /limit must not be greater than 100/],
      [{ hasIata: 'maybe' }, /hasIata must be a boolean/],
      [{ unknown: 'x' }, /property unknown should not exist/],
      [
        { lat: '51.5', lng: '-0.12', radiusMi: '10', bbox: '-1,51,1,52' },
        /use either lat, lng and radiusMi or bbox, not both/,
      ],
      [
        { country: Array.from({ length: MAX_COUNTRIES + 1 }, (_, i) => `Country ${i}`) },
        /country accepts at most 50 values/,
      ],
    ])('400s with the error shape for %j', async (query, pattern) => {
      const res = await request(http).get(`${api}/airports`).query(query).expect(400);
      expectError(res.body, 400);
      expect(res.body.error).toBe('Bad Request');
      expect([res.body.message].flat().join('\n')).toMatch(pattern);
    });
  });

  describe('request URL length', () => {
    // `x` is an unknown parameter: at the limit it reaches validation (400); over it, it doesn't.
    const urlOfLength = (length: number) => {
      const base = `${api}/airports?x=`;
      return base + 'a'.repeat(length - base.length);
    };

    it(`lets a ${MAX_REQUEST_URL_LENGTH}-character URL through to validation`, async () => {
      const url = urlOfLength(MAX_REQUEST_URL_LENGTH);
      expect(url).toHaveLength(MAX_REQUEST_URL_LENGTH);
      const res = await request(http).get(url).expect(400);
      expect(res.body.message).toEqual(['property x should not exist']);
    });

    it('answers 414 in the error shape, before validation, one character over', async () => {
      const res = await request(http)
        .get(urlOfLength(MAX_REQUEST_URL_LENGTH + 1))
        .expect(414);
      expectError(res.body, 414);
      expect(res.body).toEqual({
        statusCode: 414,
        error: 'URI Too Long',
        message: `Request URL is ${MAX_REQUEST_URL_LENGTH + 1} characters; the limit is ${MAX_REQUEST_URL_LENGTH}`,
      });
    });
  });

  describe('GET /airports/points', () => {
    it('returns every match, the same set as the list', async () => {
      const filters = { country: ['France', 'Spain'], hasIata: 'true' };
      const points = (await request(http).get(`${api}/airports/points`).query(filters).expect(200))
        .body as PointsResponse;

      const listed: string[] = [];
      let total = 0;
      for (let page = 1; page === 1 || listed.length < total; page++) {
        const list = (
          await request(http)
            .get(`${api}/airports`)
            .query({ ...filters, limit: 100, sort: 'icao', page })
            .expect(200)
        ).body as Paginated<AirportDto>;
        total = list.meta.total;
        listed.push(...list.data.map((a) => a.icaoCode));
        if (list.data.length === 0) break;
      }

      expect(points.total).toBe(total);
      expect(points.total).toBeGreaterThan(100); // exercises more than one list page
      expect(points.data).toHaveLength(points.total);
      expect(points.data.map((p) => p.icaoCode)).toEqual(listed);
      expect(Object.keys(points.data[0]!).sort()).toEqual(['icaoCode', 'lat', 'lng']);
    });

    it('returns all 4,187 airports unfiltered', async () => {
      const res = await request(http).get(`${api}/airports/points`).expect(200);
      expect(res.body.total).toBe(4187);
      expect(res.body.data).toHaveLength(4187);
    });

    it('negotiates GeoJSON from the Accept header', async () => {
      const res = await request(http)
        .get(`${api}/airports/points?country=Iceland`)
        .set('Accept', GEOJSON_MEDIA_TYPE)
        .expect(200);
      expect(res.headers['content-type']).toMatch(/^application\/geo\+json/);
      const body = JSON.parse(res.text) as PointFeatureCollection;
      expect(body.type).toBe('FeatureCollection');
      expect(body.total).toBe(11);
      expect(body.features[0]).toEqual({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-18.072, 65.66] },
        properties: { icaoCode: 'BIAR' },
      });
    });

    it('rejects paging params', async () => {
      const res = await request(http).get(`${api}/airports/points?page=2`).expect(400);
      expectError(res.body, 400);
    });

    it('keeps errors JSON even when GeoJSON was requested', async () => {
      const res = await request(http)
        .get(`${api}/airports/points?lat=1`)
        .set('Accept', GEOJSON_MEDIA_TYPE)
        .expect(400);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expectError(JSON.parse(res.text), 400);
    });
  });

  describe('GET /airports/:icao', () => {
    it('is case-insensitive', async () => {
      const res = await request(http).get(`${api}/airports/kjfk`).expect(200);
      expect(res.body).toMatchObject({ icaoCode: 'KJFK', lat: 40.64, lng: -73.779 });
    });

    it('404s for an unknown code and 400s for a malformed one', async () => {
      const missing = await request(http).get(`${api}/airports/ZZZZ`).expect(404);
      expect(missing.body).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: 'Airport ZZZZ not found',
      });
      expectError((await request(http).get(`${api}/airports/TOOLONG`).expect(400)).body, 400);
    });
  });

  describe('GET /airports/:icao/nearest', () => {
    it('returns the k nearest with distances', async () => {
      const res = await request(http).get(`${api}/airports/egll/nearest?k=3`).expect(200);
      expect(res.body.origin.icaoCode).toBe('EGLL');
      expect(res.body.data.map((a: AirportDto) => [a.icaoCode, a.distanceMi])).toEqual([
        ['EGWU', 5.6],
        ['EGRR', 15.4],
        ['EGLF', 19.5],
      ]);
    });

    it('defaults k to 5 and validates its bounds', async () => {
      const res = await request(http).get(`${api}/airports/EGLL/nearest`).expect(200);
      expect(res.body.data).toHaveLength(5);
      expectError(
        (await request(http).get(`${api}/airports/EGLL/nearest?k=51`).expect(400)).body,
        400,
      );
      expectError(
        (await request(http).get(`${api}/airports/EGLL/nearest?k=0`).expect(400)).body,
        400,
      );
    });

    it('404s for an unknown origin', async () => {
      expectError((await request(http).get(`${api}/airports/ZZZZ/nearest`).expect(404)).body, 404);
    });
  });

  describe('GET /airports/distance', () => {
    it('returns miles between two airports', async () => {
      const res = await request(http).get(`${api}/airports/distance?from=egll&to=KJFK`).expect(200);
      expect(res.body).toEqual({ from: 'EGLL', to: 'KJFK', distanceMi: 3451.3 });
    });

    it('404s naming the unknown code and 400s on missing params', async () => {
      const res = await request(http).get(`${api}/airports/distance?from=EGLL&to=ZZZZ`).expect(404);
      expect(res.body.message).toBe('Airport not found: ZZZZ');
      expectError(
        (await request(http).get(`${api}/airports/distance?from=EGLL`).expect(400)).body,
        400,
      );
    });
  });

  describe('POST /airports/within', () => {
    const london = [
      [-1, 51],
      [1, 51],
      [1, 52],
      [-1, 52],
      [-1, 51],
    ];

    it('returns airports inside the polygon', async () => {
      const res = await request(http)
        .post(`${api}/airports/within`)
        .send({ type: 'Polygon', coordinates: [london] })
        .expect(200);
      expect(res.body.total).toBe(15);
      expect(res.body.data).toHaveLength(15);
      expect(res.body.data.map((a: AirportDto) => a.icaoCode)).toContain('EGLL');
    });

    it.each([
      [{ type: 'Point', coordinates: [london] }, /type must be 'Polygon'/],
      [{ type: 'Polygon', coordinates: [london.slice(0, 3)] }, /at least 4 positions/],
      [{ type: 'Polygon', coordinates: [[...london.slice(0, 4), [0, 0]]] }, /must be closed/],
      [
        { type: 'Polygon', coordinates: [london.map(([x, y]) => [x! * 200, y])] },
        /lng in \[-180, 180\]/,
      ],
      [
        {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 1],
              [1, 0],
              [0, 1],
              [0, 0],
            ],
          ],
        },
        /polygon is not valid: Self-intersection/,
      ],
    ])('400s for an invalid polygon %#', async (body, pattern) => {
      const res = await request(http).post(`${api}/airports/within`).send(body).expect(400);
      expectError(res.body, 400);
      expect([res.body.message].flat().join('\n')).toMatch(pattern);
    });

    it('400s with the error shape for malformed JSON', async () => {
      const res = await request(http)
        .post(`${api}/airports/within`)
        .set('Content-Type', 'application/json')
        .send('{"type":')
        .expect(400);
      expectError(res.body, 400);
    });
  });

  describe('GET /countries', () => {
    it('lists distinct countries with counts, sorted', async () => {
      const res = await request(http).get(`${api}/countries`).expect(200);
      expect(res.body).toHaveLength(215);
      expect(res.body).toContainEqual({ country: 'Iceland', count: 11 });
      const total = res.body.reduce((sum: number, c: { count: number }) => sum + c.count, 0);
      expect(total).toBe(4187);
    });
  });

  it('404s unknown API routes with the error shape', async () => {
    const res = await request(http).get(`${api}/nope`).expect(404);
    expect(res.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Cannot GET /api/v1/nope',
    });
  });
});
