/**
 * HTTP contract for /api/v1. The API serializes exactly these shapes and the web app consumes
 * them, so a breaking change here fails typecheck on both sides.
 */

export interface AirportDto {
  icaoCode: string;
  iataCode: string | null;
  name: string;
  city: string;
  country: string;
  altitudeFt: number;
  lat: number;
  lng: number;
  /** Great-circle distance from the search center, rounded to 0.1 mi. Present only with a center. */
  distanceMi?: number;
}

/** Minimal shape for map pins: every match is returned, so keep it small. */
export interface AirportPointDto {
  icaoCode: string;
  lat: number;
  lng: number;
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  pageCount: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface PointsResponse {
  data: AirportPointDto[];
  total: number;
}

export const SORT_FIELDS = ['relevance', 'name', 'altitude', 'distance', 'icao'] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export type SortOrder = 'asc' | 'desc';

/**
 * Filters shared by GET /airports and GET /airports/points. All combine with AND.
 * Query-string form: `country` repeats (`?country=France&country=Spain`) and `bbox` is
 * `minLng,minLat,maxLng,maxLat`.
 */
export interface AirportFilters {
  /** Free text: exact ICAO/IATA match ranks first, then full-text, then fuzzy name/city. */
  q?: string;
  country?: string[];
  iata?: string;
  hasIata?: boolean;
  minAltitudeFt?: number;
  maxAltitudeFt?: number;
  /** Center for a radius search; lat, lng and radiusMi must be given together. */
  lat?: number;
  lng?: number;
  radiusMi?: number;
  bbox?: [minLng: number, minLat: number, maxLng: number, maxLat: number];
}

export interface AirportSearchParams extends AirportFilters {
  /** Defaults: relevance when q is set, else distance when a center is set, else name. */
  sort?: SortField;
  order?: SortOrder;
  page?: number;
  limit?: number;
}

export interface CountryCount {
  country: string;
  count: number;
}

export interface DistanceResponse {
  from: string;
  to: string;
  distanceMi: number;
}

/** GeoJSON Polygon body for POST /airports/within. */
export interface WithinRequest {
  type: 'Polygon';
  coordinates: [number, number][][];
}

export interface HealthResponse {
  status: 'ok' | 'error';
  database: 'up' | 'down';
  postgis: string | null;
}

/** Shape of every non-2xx response. */
export interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
}

export const RADIUS_PRESETS_MI = [10, 25, 50, 100, 250, 500, 1000] as const;
export const MIN_RADIUS_MI = 1;
export const MAX_RADIUS_MI = 3000;
export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 100;
export const MAX_NEAREST_K = 50;
export const DEFAULT_NEAREST_K = 5;
/** Longest accepted `q` after trimming. */
export const MAX_QUERY_LENGTH = 100;

/** Response of POST /airports/within: every airport inside the polygon, sorted by name. */
export interface WithinResponse {
  data: AirportDto[];
  total: number;
}

/** Response of GET /airports/:icao/nearest: the origin plus its k nearest airports, closest first. */
export interface NearestResponse {
  origin: AirportDto;
  data: AirportDto[];
}

/** Returned for `format=geojson` or `Accept: application/geo+json` on /airports and /points. */
export const GEOJSON_MEDIA_TYPE = 'application/geo+json';
export const RESPONSE_FORMATS = ['json', 'geojson'] as const;
export type ResponseFormat = (typeof RESPONSE_FORMATS)[number];

export interface PointFeature<P> {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [lng: number, lat: number] };
  properties: P;
}

export interface FeatureCollection<P> {
  type: 'FeatureCollection';
  features: PointFeature<P>[];
}

export type AirportFeatureProperties = Omit<AirportDto, 'lat' | 'lng'>;

/** GeoJSON form of GET /airports: one feature per airport on the page, plus the page meta. */
export interface AirportFeatureCollection extends FeatureCollection<AirportFeatureProperties> {
  meta: PageMeta;
}

/** GeoJSON form of GET /airports/points. */
export interface PointFeatureCollection extends FeatureCollection<{ icaoCode: string }> {
  total: number;
}
