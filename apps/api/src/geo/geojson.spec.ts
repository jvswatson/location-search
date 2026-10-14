import type { AirportDto } from '@location-search/shared';
import { airportsToGeoJson, pointsToGeoJson } from './geojson.js';

const heathrow: AirportDto = {
  icaoCode: 'EGLL',
  iataCode: 'LHR',
  name: 'Heathrow',
  city: 'London',
  country: 'Engalnd',
  altitudeFt: 82,
  lat: 51.477,
  lng: -0.461,
  distanceMi: 14.6,
};

describe('GeoJSON serializers', () => {
  it('turns airports into Point features with [lng, lat] and the rest as properties', () => {
    const meta = { total: 1, page: 1, limit: 25, pageCount: 1 };
    expect(airportsToGeoJson([heathrow], meta)).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-0.461, 51.477] },
          properties: {
            icaoCode: 'EGLL',
            iataCode: 'LHR',
            name: 'Heathrow',
            city: 'London',
            country: 'Engalnd',
            altitudeFt: 82,
            distanceMi: 14.6,
          },
        },
      ],
      meta,
    });
  });

  it('keeps point features minimal', () => {
    expect(pointsToGeoJson([{ icaoCode: 'EGLL', lat: 51.477, lng: -0.461 }], 1)).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-0.461, 51.477] },
          properties: { icaoCode: 'EGLL' },
        },
      ],
      total: 1,
    });
  });

  it('serializes an empty result as an empty collection', () => {
    expect(pointsToGeoJson([], 0)).toEqual({ type: 'FeatureCollection', features: [], total: 0 });
  });
});
