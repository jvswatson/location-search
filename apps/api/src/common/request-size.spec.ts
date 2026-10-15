import {
  MAX_COUNTRIES,
  MAX_PAGE_LIMIT,
  MAX_POLYGON_POINTS,
  MAX_QUERY_LENGTH,
  MAX_REQUEST_URL_LENGTH,
} from '@location-search/shared';
import { loadCleanAirports } from '../database/seed/seeder.js';

/**
 * The parameter caps are meant to keep every legitimate request far below MAX_REQUEST_URL_LENGTH
 * (and below the 8 KB request-line default of common proxies such as nginx). This builds the
 * largest URL the API accepts, from the real dataset, so a data change (longer country names) or a
 * new parameter that eats the margin fails here instead of in production.
 */
describe('worst-case request URL', () => {
  it('stays under 75% of MAX_REQUEST_URL_LENGTH', async () => {
    const { airports } = await loadCleanAirports();
    const encodedLength = (name: string) =>
      new URLSearchParams([['country', name]]).toString().length;
    const longestCountries = [...new Set(airports.map((a) => a.country))]
      .sort((a, b) => encodedLength(b) - encodedLength(a))
      .slice(0, MAX_COUNTRIES);

    const params = new URLSearchParams([
      // 3 UTF-8 bytes per character → 9 encoded characters each: the longest possible q.
      ['q', '東'.repeat(MAX_QUERY_LENGTH)],
      ...longestCountries.map((c) => ['country', c]),
      ['iata', 'LHR'],
      ['hasIata', 'true'],
      ['minAltitudeFt', '-1263'],
      ['maxAltitudeFt', '14500'],
      // The largest area parameter (bbox/radius are shorter, and only one area is allowed): every
      // point at the longest possible coordinates.
      [
        'polygon',
        Array.from({ length: MAX_POLYGON_POINTS }, () => '-179.12345,-85.12345').join(';'),
      ],
      ['sort', 'relevance'],
      ['order', 'desc'],
      ['page', '168'],
      ['limit', String(MAX_PAGE_LIMIT)],
      ['format', 'geojson'],
    ]);
    const url = `/api/v1/airports/points?${params.toString()}`;

    expect(longestCountries).toHaveLength(MAX_COUNTRIES);
    // Measured at 4,793 characters with a 100-point polygon (2,338 before polygons). Fail well before
    // the 8,000 cap: at 75% there are still 2,000 characters of headroom for whatever grew.
    expect(url.length).toBeLessThan(MAX_REQUEST_URL_LENGTH * 0.75);
  });
});
