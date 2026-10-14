import { MAX_RADIUS_MI, MIN_RADIUS_MI } from '@location-search/shared';

export interface LatLng {
  lat: number;
  lng: number;
}

/** [[south, west], [north, east]] — Leaflet's LatLngBoundsLiteral. */
export type Bounds = [[number, number], [number, number]];

/** Mean Earth radius (6371.0088 km) in miles. */
export const EARTH_RADIUS_MI = 3958.7613;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Great-circle (haversine) distance in miles. */
export function haversineMi(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/** Point reached from `origin` travelling `distanceMi` along `bearingDeg` (0 = north, 90 = east). */
export function destinationPoint(origin: LatLng, bearingDeg: number, distanceMi: number): LatLng {
  const delta = distanceMi / EARTH_RADIUS_MI;
  const theta = toRad(bearingDeg);
  const phi1 = toRad(origin.lat);
  const lambda1 = toRad(origin.lng);
  const sinPhi2 =
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2),
    );
  return { lat: toDeg(phi2), lng: wrapLng(toDeg(lambda2)) };
}

export function clampRadius(mi: number): number {
  return Math.min(MAX_RADIUS_MI, Math.max(MIN_RADIUS_MI, Math.round(mi)));
}

/** Where the drag handle sits: on the circle's edge, due east of the center. */
export function handlePosition(center: LatLng, radiusMi: number): LatLng {
  return destinationPoint(center, 90, radiusMi);
}

/** Radius implied by a dragged handle: whole miles, clamped to the allowed range. */
export function radiusFromHandle(center: LatLng, handle: LatLng): number {
  return clampRadius(haversineMi(center, handle));
}

export function roundCoord(value: number, digits = 5): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** Bounding box of a circle (does not model antimeridian wrap). */
export function circleBounds(center: LatLng, radiusMi: number): Bounds {
  const north = destinationPoint(center, 0, radiusMi);
  const south = destinationPoint(center, 180, radiusMi);
  const east = destinationPoint(center, 90, radiusMi);
  const west = destinationPoint(center, 270, radiusMi);
  return [
    [Math.min(south.lat, north.lat), Math.min(west.lng, east.lng)],
    [Math.max(south.lat, north.lat), Math.max(west.lng, east.lng)],
  ];
}

export function pointsBounds(points: readonly LatLng[]): Bounds | null {
  if (points.length === 0) return null;
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const p of points) {
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
    if (p.lng < west) west = p.lng;
    if (p.lng > east) east = p.lng;
  }
  return [
    [south, west],
    [north, east],
  ];
}
