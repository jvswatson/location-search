import type {
  AirportDto,
  AirportSearchParams,
  CountryCount,
  ErrorResponse,
  Paginated,
  PointsResponse,
} from '@location-search/shared';

const BASE = '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly body?: ErrorResponse;

  constructor(status: number, message: string, body?: ErrorResponse) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

type Primitive = string | number | boolean;
type QueryRecord = Record<string, Primitive | Primitive[] | undefined>;

/** Builds a query string: arrays repeat the key, empty/undefined values are omitted. */
export function buildQueryString(params: QueryRecord): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      for (const v of value) if (v !== '') search.append(key, String(v));
    } else {
      search.append(key, String(value));
    }
  }
  return search.toString();
}

function toRecord(params: AirportSearchParams): QueryRecord {
  const { bbox, ...rest } = params;
  return { ...rest, bbox: bbox?.join(',') };
}

export const airportsQuery = (params: AirportSearchParams): string =>
  buildQueryString(toRecord(params));

/** /airports/points takes the same filters but no sorting or paging. */
export function pointsQuery(params: AirportSearchParams): string {
  const { sort: _s, order: _o, page: _p, limit: _l, ...filters } = params;
  return buildQueryString(toRecord(filters));
}

async function getJson<T>(path: string, query: string, signal?: AbortSignal): Promise<T> {
  const url = new URL(`${BASE}${path}${query ? `?${query}` : ''}`, window.location.origin);
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'Could not reach the server.');
  }
  if (!res.ok) {
    let body: ErrorResponse | undefined;
    try {
      body = (await res.json()) as ErrorResponse;
    } catch {
      /* non-JSON error body */
    }
    const message = Array.isArray(body?.message) ? body.message.join('; ') : body?.message;
    throw new ApiError(res.status, message ?? (res.statusText || 'Request failed'), body);
  }
  return (await res.json()) as T;
}

export const fetchAirports = (params: AirportSearchParams, signal?: AbortSignal) =>
  getJson<Paginated<AirportDto>>('/airports', airportsQuery(params), signal);

export const fetchAirportPoints = (params: AirportSearchParams, signal?: AbortSignal) =>
  getJson<PointsResponse>('/airports/points', pointsQuery(params), signal);

export const fetchCountries = (signal?: AbortSignal) =>
  getJson<CountryCount[]>('/countries', '', signal);
