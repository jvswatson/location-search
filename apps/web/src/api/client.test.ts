import { describe, expect, it, vi } from 'vitest';
import { MAX_REQUEST_URL_LENGTH } from '@location-search/shared';
import {
  airportsQuery,
  ApiError,
  buildQueryString,
  fetchAirports,
  pointsQuery,
  REQUEST_TOO_LARGE_MESSAGE,
} from './client';
import { describeError } from './errors';

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

describe('request size guard', () => {
  it(`refuses to send a URL over ${MAX_REQUEST_URL_LENGTH} characters, with a friendly message`, async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const country = Array.from({ length: 600 }, (_, i) => `A very long country name ${i}`);
    const err = await fetchAirports({ country }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(414);
    expect(describeError(err)).toBe(REQUEST_TOO_LARGE_MESSAGE);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('shows the same friendly message for a 414 from the API', () => {
    const err = new ApiError(414, 'Request URL is 9001 characters; the limit is 8000');
    expect(describeError(err)).toBe(REQUEST_TOO_LARGE_MESSAGE);
  });
});
