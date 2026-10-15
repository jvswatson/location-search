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

/** `[minLng, minLat, maxLng, maxLat]`, the API's bbox order. */
export type BBox = [number, number, number, number];

export type RectangleResult = { ok: true; bbox: BBox } | { ok: false; error: string };

export const ANTIMERIDIAN_ERROR =
  "A search area can't cross the antimeridian (±180° longitude). Draw it on one side.";
export const DEGENERATE_RECTANGLE_ERROR = 'Click two different corners to draw a rectangle.';

/**
 * The rectangle spanned by two clicked corners, in either order. Leaflet reports unwrapped
 * longitudes on panned world copies (e.g. 190°), so both corners are shifted into −180…180 by the
 * same multiple of 360°; if that leaves the second corner outside the range, the rectangle crosses
 * the antimeridian, which the API rejects. Coordinates are rounded to 5 decimals (~1 m).
 */
export function rectangleFromCorners(a: LatLng, b: LatLng): RectangleResult {
  const shift = Math.floor((a.lng + 180) / 360) * 360;
  const lngA = a.lng - shift;
  const lngB = b.lng - shift;
  if (lngB < -180 || lngB > 180) return { ok: false, error: ANTIMERIDIAN_ERROR };

  const clampLat = (lat: number) => Math.max(-90, Math.min(90, lat));
  const minLng = roundCoord(Math.min(lngA, lngB));
  const maxLng = roundCoord(Math.max(lngA, lngB));
  const minLat = roundCoord(clampLat(Math.min(a.lat, b.lat)));
  const maxLat = roundCoord(clampLat(Math.max(a.lat, b.lat)));
  if (minLng === maxLng || minLat === maxLat)
    return { ok: false, error: DEGENERATE_RECTANGLE_ERROR };
  return { ok: true, bbox: [minLng, minLat, maxLng, maxLat] };
}

export function bboxBounds([minLng, minLat, maxLng, maxLat]: BBox): Bounds {
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}

export const sameBBox = (a: BBox | null, b: BBox | null): boolean =>
  a === b || (a !== null && b !== null && a.every((v, i) => v === b[i]));

/** Parses `minLng,minLat,maxLng,maxLat`; null unless it is a valid, non-wrapping box. */
export function parseBBox(raw: string | null): BBox | null {
  if (!raw) return null;
  const parts = raw.split(',').map((p) => (p.trim() === '' ? NaN : Number(p)));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [minLng, minLat, maxLng, maxLat] = parts as BBox;
  const lngOk = minLng >= -180 && maxLng <= 180 && minLng < maxLng;
  const latOk = minLat >= -90 && maxLat <= 90 && minLat < maxLat;
  return lngOk && latOk ? [minLng, minLat, maxLng, maxLat] : null;
}
