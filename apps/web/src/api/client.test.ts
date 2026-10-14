import { describe, expect, it } from 'vitest';
import { airportsQuery, buildQueryString, pointsQuery } from './client';

describe('buildQueryString', () => {
  it('repeats array params and omits empties', () => {
    expect(
      buildQueryString({ country: ['France', 'Spain'], q: '', iata: undefined, page: 2, a: [] }),
    ).toBe('country=France&country=Spain&page=2');
  });

  it('encodes values', () => {
    expect(buildQueryString({ q: 'a b&c' })).toBe('q=a+b%26c');
  });
});

describe('airportsQuery / pointsQuery', () => {
  it('serializes bbox as comma-separated and booleans as strings', () => {
    expect(airportsQuery({ bbox: [-10, 20, 30, 40], hasIata: true })).toBe(
      'hasIata=true&bbox=-10%2C20%2C30%2C40',
    );
  });

  it('drops sort, order, page and limit for points', () => {
    expect(
      pointsQuery({ q: 'x', sort: 'name', order: 'asc', page: 3, limit: 25, country: ['A'] }),
    ).toBe('q=x&country=A');
  });
});
