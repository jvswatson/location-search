import {
  DEFAULT_PAGE_LIMIT,
  SORT_FIELDS,
  type AirportSearchParams,
  type SortField,
  type SortOrder,
} from '@location-search/shared';
import { clampRadius, type LatLng } from '../lib/geo';

export const DEFAULT_RADIUS_MI = 50;

export interface QueryState {
  q: string;
  countries: string[];
  minAltitudeFt?: number;
  maxAltitudeFt?: number;
  hasIata: boolean;
  center: LatLng | null;
  radiusMi: number;
  sort?: SortField;
  order?: SortOrder;
  page: number;
}

export const initialState: QueryState = {
  q: '',
  countries: [],
  hasIata: false,
  center: null,
  radiusMi: DEFAULT_RADIUS_MI,
  page: 1,
};

/** True when any filter narrows the result set (page, sort and radius alone do not). */
export function isFilterActive(s: QueryState): boolean {
  return (
    s.center !== null ||
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
    (s.sort === 'relevance' && s.q.trim() === '') || (s.sort === 'distance' && s.center === null);
  if (!invalid) return s;
  const { sort: _sort, order: _order, ...rest } = s;
  return rest;
}

export function effectiveSort(s: QueryState): SortField {
  if (s.sort) return s.sort;
  if (s.q.trim()) return 'relevance';
  return s.center ? 'distance' : 'name';
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
  const lat = num(p.get('lat'));
  const lng = num(p.get('lng'));
  const hasCenter =
    lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const radius = num(p.get('radiusMi'));
  const sort = p.get('sort');
  const order = p.get('order');
  const page = num(p.get('page'));
  const state: QueryState = {
    q: p.get('q') ?? '',
    countries: [...new Set(p.getAll('country').filter((c) => c !== ''))],
    hasIata: p.get('hasIata') === 'true',
    center: hasCenter ? { lat, lng } : null,
    radiusMi: radius === undefined ? DEFAULT_RADIUS_MI : clampRadius(radius),
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
