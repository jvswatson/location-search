import {
  DEFAULT_PAGE_LIMIT,
  formatPolygonParam,
  type LngLat,
  MAX_COUNTRIES,
  parsePolygonParam,
  SORT_FIELDS,
  type AirportSearchParams,
  type SortField,
  type SortOrder,
} from '@location-search/shared';
import { type BBox, clampRadius, type LatLng, parseBBox } from '../lib/geo';

export const DEFAULT_RADIUS_MI = 50;

/** How a click on the map defines the search area. One area at a time. */
export const AREA_MODES = ['radius', 'rectangle', 'polygon'] as const;
export type AreaMode = (typeof AREA_MODES)[number];

export interface QueryState {
  q: string;
  countries: string[];
  minAltitudeFt?: number;
  maxAltitudeFt?: number;
  hasIata: boolean;
  areaMode: AreaMode;
  /** Radius mode: the clicked center. Always null in rectangle mode. */
  center: LatLng | null;
  radiusMi: number;
  /** Rectangle mode: the drawn box. Null in the other modes. */
  bbox: BBox | null;
  /** Polygon mode: the finished outline (an open ring of [lng, lat]). Null in the other modes. */
  polygon: LngLat[] | null;
  sort?: SortField;
  order?: SortOrder;
  page: number;
}

export const initialState: QueryState = {
  q: '',
  countries: [],
  hasIata: false,
  areaMode: 'radius',
  center: null,
  radiusMi: DEFAULT_RADIUS_MI,
  bbox: null,
  polygon: null,
  page: 1,
};

/** True when the search has an area (radius center, rectangle or polygon) to measure from. */
export const hasArea = (s: QueryState): boolean =>
  s.center !== null || s.bbox !== null || s.polygon !== null;

/** Identity of the filters other than the map area (text, countries, altitude, IATA). */
export const nonAreaFilterKey = (s: QueryState): string =>
  JSON.stringify([
    s.q.trim(),
    s.countries,
    s.minAltitudeFt ?? null,
    s.maxAltitudeFt ?? null,
    s.hasIata,
  ]);

/** True when any filter narrows the result set (page, sort, mode and radius alone do not). */
export function isFilterActive(s: QueryState): boolean {
  return (
    hasArea(s) ||
    s.q.trim() !== '' ||
    s.countries.length > 0 ||
    s.minAltitudeFt !== undefined ||
    s.maxAltitudeFt !== undefined ||
    s.hasIata
  );
}

/** Drops sort choices that the current filters make invalid. */
export function normalizeState(s: QueryState): QueryState {
  const invalid =
    (s.sort === 'relevance' && s.q.trim() === '') || (s.sort === 'distance' && !hasArea(s));
  if (!invalid) return s;
  const { sort: _sort, order: _order, ...rest } = s;
  return rest;
}

export function effectiveSort(s: QueryState): SortField {
  if (s.sort) return s.sort;
  if (s.q.trim()) return 'relevance';
  return hasArea(s) ? 'distance' : 'name';
}

export function effectiveOrder(s: QueryState): SortOrder {
  return s.order ?? 'asc';
}

const num = (v: string | null): number | undefined => {
  if (v === null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export function serializeState(s: QueryState): string {
  const p = new URLSearchParams();
  if (s.q) p.set('q', s.q);
  for (const c of s.countries) p.append('country', c);
  if (s.minAltitudeFt !== undefined) p.set('minAltitudeFt', String(s.minAltitudeFt));
  if (s.maxAltitudeFt !== undefined) p.set('maxAltitudeFt', String(s.maxAltitudeFt));
  if (s.hasIata) p.set('hasIata', 'true');
  if (s.areaMode !== 'radius') p.set('area', s.areaMode);
  if (s.bbox) p.set('bbox', s.bbox.join(','));
  if (s.polygon) p.set('polygon', formatPolygonParam(s.polygon));
  if (s.center) {
    p.set('lat', String(s.center.lat));
    p.set('lng', String(s.center.lng));
  }
  if (s.center || s.radiusMi !== DEFAULT_RADIUS_MI) p.set('radiusMi', String(s.radiusMi));
  if (s.sort) p.set('sort', s.sort);
  if (s.order) p.set('order', s.order);
  if (s.page > 1) p.set('page', String(s.page));
  return p.toString();
}

export function parseState(search: string): QueryState {
  const p = new URLSearchParams(search);
  const bbox = parseBBox(p.get('bbox'));
  // Same validation as the API, so a hand-edited link can't restore a polygon it would reject.
  const polygonRaw = p.get('polygon');
  const parsedPolygon = polygonRaw ? parsePolygonParam(polygonRaw) : null;
  const polygon = parsedPolygon?.ok ? parsedPolygon.points : null;
  // An explicit area= wins; otherwise a valid polygon or bbox implies its mode.
  const areaParam = p.get('area');
  const areaMode: AreaMode = (AREA_MODES as readonly string[]).includes(areaParam ?? '')
    ? (areaParam as AreaMode)
    : polygon
      ? 'polygon'
      : bbox
        ? 'rectangle'
        : 'radius';
  const lat = num(p.get('lat'));
  const lng = num(p.get('lng'));
  const hasCenter =
    areaMode === 'radius' &&
    lat !== undefined &&
    lng !== undefined &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;
  const radius = num(p.get('radiusMi'));
  const sort = p.get('sort');
  const order = p.get('order');
  const page = num(p.get('page'));
  const state: QueryState = {
    q: p.get('q') ?? '',
    // A hand-edited or old link could carry more than the API accepts; keep the first MAX_COUNTRIES.
    countries: [...new Set(p.getAll('country').filter((c) => c !== ''))].slice(0, MAX_COUNTRIES),
    hasIata: p.get('hasIata') === 'true',
    areaMode,
    center: hasCenter ? { lat, lng } : null,
    radiusMi: radius === undefined ? DEFAULT_RADIUS_MI : clampRadius(radius),
    bbox: areaMode === 'rectangle' ? bbox : null,
    polygon: areaMode === 'polygon' ? polygon : null,
    page: page !== undefined && page >= 1 ? Math.floor(page) : 1,
  };
  const minAlt = num(p.get('minAltitudeFt'));
  const maxAlt = num(p.get('maxAltitudeFt'));
  if (minAlt !== undefined) state.minAltitudeFt = minAlt;
  if (maxAlt !== undefined) state.maxAltitudeFt = maxAlt;
  if (sort && (SORT_FIELDS as readonly string[]).includes(sort)) state.sort = sort as SortField;
  if (order === 'asc' || order === 'desc') state.order = order;
  return normalizeState(state);
}

/** Filters shared by /airports and /airports/points. */
export function toFilterParams(s: QueryState): AirportSearchParams {
  const params: AirportSearchParams = {};
  const q = s.q.trim();
  if (q) params.q = q;
  if (s.countries.length) params.country = s.countries;
  if (s.minAltitudeFt !== undefined) params.minAltitudeFt = s.minAltitudeFt;
  if (s.maxAltitudeFt !== undefined) params.maxAltitudeFt = s.maxAltitudeFt;
  if (s.hasIata) params.hasIata = true;
  if (s.center) {
    params.lat = s.center.lat;
    params.lng = s.center.lng;
    params.radiusMi = s.radiusMi;
  }
  if (s.bbox) params.bbox = s.bbox;
  if (s.polygon) params.polygon = s.polygon;
  return params;
}

export function toAirportParams(s: QueryState): AirportSearchParams {
  const params = toFilterParams(s);
  if (s.sort) params.sort = s.sort;
  if (s.order) params.order = s.order;
  params.page = s.page;
  params.limit = DEFAULT_PAGE_LIMIT;
  return params;
}
