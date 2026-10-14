import type { Request } from 'express';
import { wantsGeoJson } from './airports.controller.js';

/** Minimal stand-in for Express's content negotiation over the two offered types. */
const withAccept = (accept: string | undefined) =>
  ({
    accepts: (types: string[]) => {
      if (!accept || accept.includes('*/*')) return types[0];
      return types.find((t) => accept.includes(t)) ?? false;
    },
  }) as unknown as Pick<Request, 'accepts'>;

describe('wantsGeoJson', () => {
  it('honours an explicit format over the Accept header', () => {
    expect(wantsGeoJson('geojson', withAccept('application/json'))).toBe(true);
    expect(wantsGeoJson('json', withAccept('application/geo+json'))).toBe(false);
  });

  it('negotiates from Accept when no format is given', () => {
    expect(wantsGeoJson(undefined, withAccept('application/geo+json'))).toBe(true);
    expect(wantsGeoJson(undefined, withAccept('application/json'))).toBe(false);
    expect(wantsGeoJson(undefined, withAccept('*/*'))).toBe(false);
    expect(wantsGeoJson(undefined, withAccept(undefined))).toBe(false);
  });
});
