import type { LngLat } from './polygon.js';

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

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  pageCount: number;
  /**
   * The point `distanceMi` is measured from, when the search has one: the radius center, the
   * lng/lat midpoint of `bbox`, or the centroid of `polygon` (computed in Web Mercator, as drawn;
   * it can lie outside a concave polygon). Absent when there is no area filter.
   */
  center?: GeoPoint;
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
  /**
   * Center for a radius search; lat, lng and radiusMi must be given together. A search uses at most
   * one area: a radius, a bbox or a polygon.
   */
  lat?: number;
  lng?: number;
  radiusMi?: number;
  /** Rectangle in lng/lat (straight edges on the map); must not cross the antimeridian. */
  bbox?: [minLng: number, minLat: number, maxLng: number, maxLat: number];
  /**
   * Polygon as an open ring of `[lng, lat]` points, sent as `lng,lat;lng,lat;…`. Edges are straight
   * on the (Web Mercator) map. 3–MAX_POLYGON_POINTS points; must not self-intersect or cross the
   * antimeridian (see polygonProblems, which the API also enforces).
   */
  polygon?: LngLat[];
}

export interface AirportSearchParams extends AirportFilters {
  /** Defaults: relevance when q is set, else distance when there is an area, else name. */
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
/** Most `country` values one request may carry (keeps URLs well under proxy limits). */
export const MAX_COUNTRIES = 50;
/**
 * Longest request URL (path + query) the API accepts and the web client will send. The parameter
 * caps keep real requests far below this; it is a backstop, enforced on both sides (414).
 */
export const MAX_REQUEST_URL_LENGTH = 8000;
export const DEFAULT_NEAREST_K = 5;
/** Longest accepted `q` after trimming. */
export const MAX_QUERY_LENGTH = 100;

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
