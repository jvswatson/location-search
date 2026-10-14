import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type {
  AirportDto,
  CountryCount,
  ErrorResponse,
  Paginated,
  PointsResponse,
} from '@location-search/shared';

export const server = setupServer();

export function makeAirport(i: number, extra: Partial<AirportDto> = {}): AirportDto {
  const code = `K${String(i).padStart(3, '0')}`;
  return {
    icaoCode: code,
    iataCode: i % 2 ? `A${String(i).padStart(2, '0')}` : null,
    name: `Airport ${i}`,
    city: `City ${i}`,
    country: 'United States',
    altitudeFt: 1000 * i,
    lat: 30 + i,
    lng: -100 + i,
    ...extra,
  };
}

export interface MockOptions {
  airports?: (url: URL) => Paginated<AirportDto> | Response;
  points?: (url: URL) => PointsResponse | Response;
  countries?: CountryCount[];
}

export interface Recorder {
  airports: URL[];
  points: URL[];
}

export function paginated(data: AirportDto[], total = data.length, page = 1, limit = 25) {
  return { data, meta: { total, page, limit, pageCount: Math.max(1, Math.ceil(total / limit)) } };
}

export function errorResponse(statusCode: number, message: string, error = 'Error') {
  const body: ErrorResponse = { statusCode, error, message };
  return HttpResponse.json(body, { status: statusCode });
}

/** Installs handlers for the three read endpoints and records every request URL. */
export function mockApi(opts: MockOptions = {}): Recorder {
  const rec: Recorder = { airports: [], points: [] };
  server.use(
    http.get('*/api/v1/airports/points', ({ request }) => {
      const url = new URL(request.url);
      rec.points.push(url);
      const out = opts.points?.(url) ?? { data: [], total: 0 };
      return out instanceof Response ? out : HttpResponse.json(out);
    }),
    http.get('*/api/v1/airports', ({ request }) => {
      const url = new URL(request.url);
      rec.airports.push(url);
      const out = opts.airports?.(url) ?? paginated([makeAirport(1), makeAirport(2)]);
      return out instanceof Response ? out : HttpResponse.json(out);
    }),
    http.get('*/api/v1/countries', () =>
      HttpResponse.json(
        opts.countries ?? [
          { country: 'France', count: 10 },
          { country: 'Spain', count: 5 },
        ],
      ),
    ),
  );
  return rec;
}
