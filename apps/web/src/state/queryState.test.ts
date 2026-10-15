import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_LIMIT, MAX_COUNTRIES, MAX_RADIUS_MI } from '@location-search/shared';
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
  areaMode: 'radius',
  center: { lat: 40.64, lng: -73.78 },
  radiusMi: 123,
  bbox: null,
  polygon: null,
  sort: 'altitude',
  order: 'desc',
  page: 3,
};

const rectangle: QueryState = {
  ...initialState,
  areaMode: 'rectangle',
  bbox: [-1.5, 51.1, 0.25, 51.9],
  sort: 'distance',
};

describe('serializeState / parseState', () => {
  it('round-trips a full state', () => {
    expect(parseState(serializeState(full))).toEqual(full);
  });

  it('round-trips a rectangle as area=rectangle&bbox=…', () => {
    const qs = serializeState(rectangle);
    expect(qs).toBe('area=rectangle&bbox=-1.5%2C51.1%2C0.25%2C51.9&sort=distance');
    expect(parseState(qs)).toEqual(rectangle);
  });

  it('round-trips a polygon as area=polygon&polygon=lng,lat;…', () => {
    const shape: QueryState = {
      ...initialState,
      areaMode: 'polygon',
      polygon: [
        [-1, 51],
        [1, 51],
        [0.5, 52],
      ],
    };
    const qs = serializeState(shape);
    expect(qs).toBe('area=polygon&polygon=-1%2C51%3B1%2C51%3B0.5%2C52');
    expect(parseState(qs)).toEqual(shape);
  });

  it('infers polygon mode from a polygon alone, and drops one the API would reject', () => {
    expect(parseState('polygon=-1,51;1,51;0.5,52')).toMatchObject({ areaMode: 'polygon' });
    // Self-intersecting (bow-tie): not restored, so a hand-edited link can't cause 400s.
    expect(parseState('polygon=0,0;10,10;10,0;0,10')).toMatchObject({
      areaMode: 'radius',
      polygon: null,
    });
  });

  it('keeps rectangle mode with no box drawn yet', () => {
    const empty = { ...initialState, areaMode: 'rectangle' as const };
    expect(serializeState(empty)).toBe('area=rectangle');
    expect(parseState('area=rectangle')).toEqual(empty);
  });

  it('infers rectangle mode from a bbox alone', () => {
    expect(parseState('bbox=-1,51,1,52')).toMatchObject({
      areaMode: 'rectangle',
      bbox: [-1, 51, 1, 52],
    });
  });

  it('only restores the area that belongs to the mode', () => {
    expect(parseState('lat=51&lng=0&bbox=-1,51,1,52')).toMatchObject({
      areaMode: 'rectangle',
      center: null,
      bbox: [-1, 51, 1, 52],
    });
    expect(parseState('area=radius&lat=51&lng=0&bbox=-1,51,1,52')).toMatchObject({
      areaMode: 'radius',
      center: { lat: 51, lng: 0 },
      bbox: null,
    });
  });

  it.each(['1,2,3', '1,2,0,3', '-181,0,0,1', 'a,b,c,d', '0,10,1,5'])(
    'drops an invalid bbox %s',
    (raw) => {
      expect(parseState(`bbox=${raw}`)).toMatchObject({ areaMode: 'radius', bbox: null });
    },
  );

  it(`keeps at most ${MAX_COUNTRIES} countries from a hand-edited URL`, () => {
    const qs = Array.from({ length: MAX_COUNTRIES + 5 }, (_, i) => `country=C${i}`).join('&');
    const { countries } = parseState(qs);
    expect(countries).toHaveLength(MAX_COUNTRIES);
    expect(countries[0]).toBe('C0');
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
  it('is false for page, sort, radius and mode alone', () => {
    expect(isFilterActive({ ...initialState, page: 4, sort: 'icao', radiusMi: 500 })).toBe(false);
    expect(isFilterActive({ ...initialState, areaMode: 'rectangle' })).toBe(false);
    expect(isFilterActive({ ...initialState, q: '   ' })).toBe(false);
  });

  it.each([
    { q: 'x' },
    { countries: ['France'] },
    { minAltitudeFt: 0 },
    { maxAltitudeFt: 0 },
    { hasIata: true },
    { center: { lat: 1, lng: 2 } },
    { areaMode: 'rectangle' as const, bbox: [-1, 51, 1, 52] as [number, number, number, number] },
  ])('is true for %o', (patch) => {
    expect(isFilterActive({ ...initialState, ...patch })).toBe(true);
  });
});

describe('sort helpers', () => {
  it('derives the default sort', () => {
    expect(effectiveSort(initialState)).toBe('name');
    expect(effectiveSort({ ...initialState, q: 'a' })).toBe('relevance');
    expect(effectiveSort({ ...initialState, center: { lat: 0, lng: 0 } })).toBe('distance');
    expect(effectiveSort(rectangle)).toBe('distance');
    expect(effectiveSort({ ...rectangle, sort: undefined })).toBe('distance');
    expect(effectiveOrder(initialState)).toBe('asc');
  });

  it('normalizeState removes relevance without q', () => {
    expect(normalizeState({ ...initialState, sort: 'relevance', order: 'asc' })).toEqual(
      initialState,
    );
  });

  it('normalizeState keeps distance with a rectangle and drops it without an area', () => {
    expect(normalizeState(rectangle).sort).toBe('distance');
    expect(normalizeState({ ...rectangle, bbox: null }).sort).toBeUndefined();
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

  it('sends a polygon as polygon and nothing else', () => {
    const polygon: [number, number][] = [
      [-1, 51],
      [1, 51],
      [0.5, 52],
    ];
    expect(toFilterParams({ ...initialState, areaMode: 'polygon', polygon })).toEqual({ polygon });
  });

  it('sends the rectangle as bbox and no radius', () => {
    expect(toFilterParams(rectangle)).toEqual({ bbox: [-1.5, 51.1, 0.25, 51.9] });
  });
});
