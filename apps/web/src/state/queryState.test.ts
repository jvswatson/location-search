import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_LIMIT, MAX_RADIUS_MI } from '@location-search/shared';
import {
  effectiveOrder,
  effectiveSort,
  initialState,
  isFilterActive,
  normalizeState,
  parseState,
  serializeState,
  toAirportParams,
  toFilterParams,
  type QueryState,
} from './queryState';

const full: QueryState = {
  q: 'new york & co',
  countries: ['France', 'Côte d’Ivoire'],
  minAltitudeFt: -100,
  maxAltitudeFt: 5000,
  hasIata: true,
  center: { lat: 40.64, lng: -73.78 },
  radiusMi: 123,
  sort: 'altitude',
  order: 'desc',
  page: 3,
};

describe('serializeState / parseState', () => {
  it('round-trips a full state', () => {
    expect(parseState(serializeState(full))).toEqual(full);
  });

  it('serializes the initial state to an empty string and back', () => {
    expect(serializeState(initialState)).toBe('');
    expect(parseState('')).toEqual(initialState);
  });

  it('repeats country and omits defaults', () => {
    const qs = serializeState({ ...initialState, countries: ['A', 'B'], page: 1 });
    expect(qs).toBe('country=A&country=B');
  });

  it('keeps a non-default radius even without a center', () => {
    const s = { ...initialState, radiusMi: 250 };
    expect(parseState(serializeState(s))).toEqual(s);
  });

  it('ignores garbage and clamps out-of-range values', () => {
    const s = parseState(
      'lat=abc&lng=1&radiusMi=99999&page=-4&sort=bogus&order=sideways&minAltitudeFt=x&hasIata=yes',
    );
    expect(s.center).toBeNull();
    expect(s.radiusMi).toBe(MAX_RADIUS_MI);
    expect(s.page).toBe(1);
    expect(s.sort).toBeUndefined();
    expect(s.order).toBeUndefined();
    expect(s.minAltitudeFt).toBeUndefined();
    expect(s.hasIata).toBe(false);
  });

  it('rejects out-of-range coordinates', () => {
    expect(parseState('lat=95&lng=0').center).toBeNull();
    expect(parseState('lat=0&lng=200').center).toBeNull();
  });

  it('drops sorts invalid for the filters', () => {
    expect(parseState('sort=relevance').sort).toBeUndefined();
    expect(parseState('sort=distance&order=desc')).not.toHaveProperty('order');
    expect(parseState('sort=relevance&q=jfk').sort).toBe('relevance');
  });
});

describe('isFilterActive', () => {
  it('is false for page, sort and radius alone', () => {
    expect(isFilterActive({ ...initialState, page: 4, sort: 'icao', radiusMi: 500 })).toBe(false);
    expect(isFilterActive({ ...initialState, q: '   ' })).toBe(false);
  });

  it.each([
    { q: 'x' },
    { countries: ['France'] },
    { minAltitudeFt: 0 },
    { maxAltitudeFt: 0 },
    { hasIata: true },
    { center: { lat: 1, lng: 2 } },
  ])('is true for %o', (patch) => {
    expect(isFilterActive({ ...initialState, ...patch })).toBe(true);
  });
});

describe('sort helpers', () => {
  it('derives the default sort', () => {
    expect(effectiveSort(initialState)).toBe('name');
    expect(effectiveSort({ ...initialState, q: 'a' })).toBe('relevance');
    expect(effectiveSort({ ...initialState, center: { lat: 0, lng: 0 } })).toBe('distance');
    expect(effectiveOrder(initialState)).toBe('asc');
  });

  it('normalizeState removes relevance without q', () => {
    expect(normalizeState({ ...initialState, sort: 'relevance', order: 'asc' })).toEqual(
      initialState,
    );
  });
});

describe('params', () => {
  it('builds request params with limit and page', () => {
    expect(toAirportParams(initialState)).toEqual({ page: 1, limit: DEFAULT_PAGE_LIMIT });
    expect(toFilterParams(full)).toEqual({
      q: 'new york & co',
      country: full.countries,
      minAltitudeFt: -100,
      maxAltitudeFt: 5000,
      hasIata: true,
      lat: 40.64,
      lng: -73.78,
      radiusMi: 123,
    });
  });
});
