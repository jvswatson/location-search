import {
  type AirportSearchParams,
  DEFAULT_PAGE_LIMIT,
  type GeoPoint,
  type LngLat,
  parsePolygonParam,
  polygonCentroid,
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
  /** Open ring, validated (see polygonProblems). */
  polygon?: LngLat[];
}

export interface SearchCriteria extends FilterCriteria {
  sort: SortField;
  order: SortOrder;
  page: number;
  limit: number;
}

/** Validated query input, before cross-field rules (bbox and polygon still strings). */
export type FilterInput = Omit<
  AirportSearchParams,
  'bbox' | 'polygon' | 'sort' | 'order' | 'page' | 'limit'
> & {
  bbox?: string;
  polygon?: string;
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

  if (input.polygon !== undefined) {
    const parsed = parsePolygonParam(input.polygon);
    if (parsed.ok) criteria.polygon = parsed.points;
    else errors.push(...parsed.errors);
  }

  // One area per search: the UI offers a radius, a rectangle or a polygon, one at a time.
  const areas = [centerParts > 0, input.bbox !== undefined, input.polygon !== undefined];
  if (areas.filter(Boolean).length > 1) {
    errors.push('use only one area: lat, lng and radiusMi, or bbox, or polygon');
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: criteria };
}

/**
 * The point distances are measured from: the radius center, the bbox's lng/lat midpoint (the
 * center of the rectangle as drawn on the map), or the polygon's centroid (in Web Mercator, as
 * drawn). Undefined when the search has no area.
 */
export function referencePoint(
  criteria: Pick<FilterCriteria, 'center' | 'bbox' | 'polygon'>,
): GeoPoint | undefined {
  if (criteria.center) return { lat: criteria.center.lat, lng: criteria.center.lng };
  if (criteria.polygon) return polygonCentroid(criteria.polygon);
  if (criteria.bbox) {
    const [minLng, minLat, maxLng, maxLat] = criteria.bbox;
    return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  }
  return undefined;
}

/** Default sort: relevance with q, else distance when there is an area, else name. */
export function defaultSort(
  criteria: Pick<FilterCriteria, 'q' | 'center' | 'bbox' | 'polygon'>,
): SortField {
  if (criteria.q) return 'relevance';
  if (referencePoint(criteria)) return 'distance';
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
  if (
    input.sort === 'distance' &&
    !centerGiven(input) &&
    input.bbox === undefined &&
    input.polygon === undefined
  ) {
    errors.push(
      'sort=distance requires an area: a radius (lat, lng and radiusMi), bbox or polygon',
    );
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
