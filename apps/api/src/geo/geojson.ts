import type {
  AirportDto,
  AirportFeatureCollection,
  AirportPointDto,
  PageMeta,
  PointFeature,
  PointFeatureCollection,
} from '@location-search/shared';

function toFeature<T extends { lat: number; lng: number }>(
  item: T,
): PointFeature<Omit<T, 'lat' | 'lng'>> {
  const { lat, lng, ...properties } = item;
  return { type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties };
}

export function airportsToGeoJson(data: AirportDto[], meta: PageMeta): AirportFeatureCollection {
  return { type: 'FeatureCollection', features: data.map(toFeature), meta };
}

export function pointsToGeoJson(data: AirportPointDto[], total: number): PointFeatureCollection {
  return { type: 'FeatureCollection', features: data.map(toFeature), total };
}
