import { DEFAULT_PAGE_LIMIT } from '@location-search/shared';
import {
  defaultOrder,
  defaultSort,
  referencePoint,
  resolveFilters,
  resolveSearch,
} from './search-criteria.js';

const center = { lat: 51.5, lng: -0.12, radiusMi: 25 };

describe('resolveFilters', () => {
  it('passes simple filters through and de-duplicates countries', () => {
    expect(
      resolveFilters({
        q: 'x',
        country: ['France', 'France', 'Spain'],
        iata: 'LHR',
        hasIata: false,
      }),
    ).toEqual({
      ok: true,
      value: { q: 'x', countries: ['France', 'Spain'], iata: 'LHR', hasIata: false },
    });
  });

  it('builds a center only from the full lat/lng/radius trio', () => {
    expect(resolveFilters(center)).toEqual({ ok: true, value: { center } });
    for (const partial of [
      { lat: 1 },
      { lat: 1, lng: 2 },
      { radiusMi: 5 },
      { lng: 0, radiusMi: 5 },
    ]) {
      expect(resolveFilters(partial)).toEqual({
        ok: false,
        errors: ['lat, lng and radiusMi must be given together'],
      });
    }
  });

  it('accepts lat/lng of 0 as a real center', () => {
    expect(resolveFilters({ lat: 0, lng: 0, radiusMi: 1 })).toEqual({
      ok: true,
      value: { center: { lat: 0, lng: 0, radiusMi: 1 } },
    });
  });

  it('allows an equal altitude range and rejects an inverted one', () => {
    expect(resolveFilters({ minAltitudeFt: 100, maxAltitudeFt: 100 })).toEqual({
      ok: true,
      value: { minAltitudeFt: 100, maxAltitudeFt: 100 },
    });
    expect(resolveFilters({ minAltitudeFt: 101, maxAltitudeFt: 100 })).toEqual({
      ok: false,
      errors: ['minAltitudeFt must be less than or equal to maxAltitudeFt'],
    });
  });

  it('parses bbox and reports every cross-field problem at once', () => {
    expect(resolveFilters({ bbox: '-1,51,1,52' })).toEqual({
      ok: true,
      value: { bbox: [-1, 51, 1, 52] },
    });
    const result = resolveFilters({ lat: 1, minAltitudeFt: 5, maxAltitudeFt: 1, bbox: '1,1,0,2' });
    expect(result.ok).toBe(false);
    // partial radius, altitude range, bad bbox, and radius + bbox together
    expect(!result.ok && result.errors).toHaveLength(4);
  });

  it('accepts one area at most: a radius or a bbox', () => {
    expect(resolveFilters({ ...center, bbox: '-1,51,1,52' })).toEqual({
      ok: false,
      errors: ['use either lat, lng and radiusMi or bbox, not both'],
    });
    expect(resolveFilters({ lat: 51, bbox: '-1,51,1,52' })).toMatchObject({
      ok: false,
      errors: expect.arrayContaining(['use either lat, lng and radiusMi or bbox, not both']),
    });
  });

  it('treats an empty country list as no filter', () => {
    expect(resolveFilters({ country: [] })).toEqual({ ok: true, value: {} });
  });
});

describe('referencePoint', () => {
  it('is the radius center, the bbox lng/lat midpoint, or nothing', () => {
    expect(referencePoint({ center })).toEqual({ lat: 51.5, lng: -0.12 });
    expect(referencePoint({ bbox: [-2, 50, 1, 53] })).toEqual({ lat: 51.5, lng: -0.5 });
    expect(referencePoint({})).toBeUndefined();
  });
});

describe('defaultSort / defaultOrder', () => {
  it.each([
    [{ q: 'x', center }, 'relevance'],
    [{ q: 'x' }, 'relevance'],
    [{ center }, 'distance'],
    [{ bbox: [-1, 51, 1, 52] as [number, number, number, number] }, 'distance'],
    [{}, 'name'],
  ] as const)('%j → %s', (criteria, sort) => {
    expect(defaultSort(criteria)).toBe(sort);
  });

  it('orders relevance best-first and everything else ascending', () => {
    expect(defaultOrder('relevance')).toBe('desc');
    expect(defaultOrder('name')).toBe('asc');
    expect(defaultOrder('distance')).toBe('asc');
  });
});

describe('resolveSearch', () => {
  it('fills in page, limit, sort and order defaults', () => {
    expect(resolveSearch({})).toEqual({
      ok: true,
      value: { sort: 'name', order: 'asc', page: 1, limit: DEFAULT_PAGE_LIMIT },
    });
    expect(resolveSearch({ q: 'x', ...center })).toMatchObject({
      ok: true,
      value: { sort: 'relevance', order: 'desc' },
    });
  });

  it('keeps an explicit sort and order', () => {
    expect(resolveSearch({ sort: 'altitude', order: 'desc', page: 3, limit: 10 })).toEqual({
      ok: true,
      value: { sort: 'altitude', order: 'desc', page: 3, limit: 10 },
    });
  });

  it('rejects relevance without q and distance without an area', () => {
    expect(resolveSearch({ sort: 'relevance' })).toEqual({
      ok: false,
      errors: ['sort=relevance requires q'],
    });
    expect(resolveSearch({ sort: 'distance', q: 'x' })).toEqual({
      ok: false,
      errors: ['sort=distance requires a radius (lat, lng and radiusMi) or a bbox'],
    });
    expect(resolveSearch({ sort: 'distance', ...center })).toMatchObject({ ok: true });
    expect(resolveSearch({ sort: 'distance', bbox: '-1,51,1,52' })).toMatchObject({ ok: true });
  });

  it('defaults to distance from the bbox midpoint', () => {
    expect(resolveSearch({ bbox: '-1,51,1,52' })).toMatchObject({
      ok: true,
      value: { bbox: [-1, 51, 1, 52], sort: 'distance', order: 'asc' },
    });
  });

  it('does not double-report a partial center under sort=distance', () => {
    expect(resolveSearch({ sort: 'distance', lat: 1 })).toEqual({
      ok: false,
      errors: ['lat, lng and radiusMi must be given together'],
    });
  });
});
