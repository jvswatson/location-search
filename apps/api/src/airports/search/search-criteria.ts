import {
  type AirportSearchParams,
  DEFAULT_PAGE_LIMIT,
  type SortField,
  type SortOrder,
} from '@location-search/shared';
import { type BBox, parseBBox } from '../../geo/coordinates.js';

export interface Center {
  lat: number;
  lng: number;
  radiusMi: number;
}

/** Filters after cross-field validation: what the repository turns into SQL. */
export interface FilterCriteria {
  q?: string;
  countries?: string[];
  iata?: string;
  hasIata?: boolean;
  minAltitudeFt?: number;
  maxAltitudeFt?: number;
  center?: Center;
  bbox?: BBox;
}

export interface SearchCriteria extends FilterCriteria {
  sort: SortField;
  order: SortOrder;
  page: number;
  limit: number;
}

/** Validated query input, before cross-field rules (bbox still a string). */
export type FilterInput = Omit<
  AirportSearchParams,
  'bbox' | 'sort' | 'order' | 'page' | 'limit'
> & {
  bbox?: string;
};
export type SearchInput = FilterInput &
  Pick<AirportSearchParams, 'sort' | 'order' | 'page' | 'limit'>;

export type Resolved<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Applies the rules that span fields (radius trio, altitude range, bbox) to per-field-valid input. */
export function resolveFilters(input: FilterInput): Resolved<FilterCriteria> {
  const errors: string[] = [];
  const criteria: FilterCriteria = {};

  if (input.q !== undefined) criteria.q = input.q;
  if (input.country?.length) criteria.countries = [...new Set(input.country)];
  if (input.iata !== undefined) criteria.iata = input.iata;
  if (input.hasIata !== undefined) criteria.hasIata = input.hasIata;

  const { lat, lng, radiusMi } = input;
  const centerParts = [lat, lng, radiusMi].filter((v) => v !== undefined).length;
  if (centerParts === 3) {
    criteria.center = { lat: lat!, lng: lng!, radiusMi: radiusMi! };
  } else if (centerParts > 0) {
    errors.push('lat, lng and radiusMi must be given together');
  }

  const { minAltitudeFt: min, maxAltitudeFt: max } = input;
  if (min !== undefined && max !== undefined && min > max) {
    errors.push('minAltitudeFt must be less than or equal to maxAltitudeFt');
  }
  if (min !== undefined) criteria.minAltitudeFt = min;
  if (max !== undefined) criteria.maxAltitudeFt = max;

  if (input.bbox !== undefined) {
    const parsed = parseBBox(input.bbox);
    if (parsed.ok) criteria.bbox = parsed.bbox;
    else errors.push(...parsed.errors);
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: criteria };
}

/** Default sort: relevance with q, else distance with a center, else name. */
export function defaultSort(criteria: Pick<FilterCriteria, 'q' | 'center'>): SortField {
  if (criteria.q) return 'relevance';
  if (criteria.center) return 'distance';
  return 'name';
}

/** Relevance reads best-first by default; everything else ascending. */
export const defaultOrder = (sort: SortField): SortOrder => (sort === 'relevance' ? 'desc' : 'asc');

export function resolveSearch(input: SearchInput): Resolved<SearchCriteria> {
  const filters = resolveFilters(input);
  const errors = filters.ok ? [] : [...filters.errors];
  const criteria = filters.ok ? filters.value : {};

  if (input.sort === 'relevance' && !input.q) errors.push('sort=relevance requires q');
  // Partial centers are already reported by resolveFilters.
  if (input.sort === 'distance' && !centerGiven(input)) {
    errors.push('sort=distance requires lat, lng and radiusMi');
  }
  if (errors.length) return { ok: false, errors };

  const sort = input.sort ?? defaultSort(criteria);
  return {
    ok: true,
    value: {
      ...criteria,
      sort,
      order: input.order ?? defaultOrder(sort),
      page: input.page ?? 1,
      limit: input.limit ?? DEFAULT_PAGE_LIMIT,
    },
  };
}

/** Whether any part of the center was supplied (the trio error already covers partial input). */
const centerGiven = (input: FilterInput) =>
  input.lat !== undefined || input.lng !== undefined || input.radiusMi !== undefined;
