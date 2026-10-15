import type { GeoPoint } from './airports.js';

/** `[lng, lat]`, GeoJSON order. */
export type LngLat = [lng: number, lat: number];

/** Most vertices a search polygon may have (keeps URLs short; see MAX_REQUEST_URL_LENGTH). */
export const MAX_POLYGON_POINTS = 100;
export const MIN_POLYGON_POINTS = 3;

/**
 * Highest latitude Web Mercator (EPSG:3857) can represent, which is also the edge of the map.
 * Polygons are drawn and searched in that projection, so vertices must stay within it.
 */
export const MERCATOR_MAX_LAT = 85.0511287798;

export const POLYGON_MESSAGES = {
  tooFew: `polygon needs at least ${MIN_POLYGON_POINTS} distinct points`,
  tooMany: `polygon accepts at most ${MAX_POLYGON_POINTS} points`,
  range: `polygon longitudes must be within [-180, 180] and latitudes within ±${MERCATOR_MAX_LAT.toFixed(4)}`,
  antimeridian: 'polygon must not cross the antimeridian (±180° longitude)',
  selfIntersecting: 'polygon edges must not cross or touch each other',
  zeroArea: 'polygon must enclose an area',
} as const;

const round5 = (v: number): number => Math.round(v * 1e5) / 1e5;

/** `lng,lat;lng,lat;…` with 5 decimals (~1 m). The ring is left open (no repeated first point). */
export function formatPolygonParam(points: readonly LngLat[]): string {
  return points.map(([lng, lat]) => `${round5(lng)},${round5(lat)}`).join(';');
}

export type PolygonParse = { ok: true; points: LngLat[] } | { ok: false; errors: string[] };

/**
 * Parses and validates `lng,lat;lng,lat;…`. A closing point equal to the first is accepted and
 * dropped. All rules in `polygonProblems` apply, so the API and the web client agree exactly.
 */
export function parsePolygonParam(raw: string): PolygonParse {
  const pairs = raw.trim() === '' ? [] : raw.split(';');
  // Cheap guard before any per-point work on a hostile input.
  if (pairs.length > MAX_POLYGON_POINTS + 1)
    return { ok: false, errors: [POLYGON_MESSAGES.tooMany] };

  const points: LngLat[] = [];
  for (const [i, pair] of pairs.entries()) {
    const parts = pair.split(',');
    const nums = parts.map((p) => (p.trim() === '' ? NaN : Number(p)));
    if (nums.length !== 2 || nums.some((n) => !Number.isFinite(n))) {
      return { ok: false, errors: [`polygon point ${i + 1} must be "lng,lat" with numbers`] };
    }
    points.push([nums[0]!, nums[1]!]);
  }
  const first = points[0];
  const last = points.at(-1);
  if (points.length > 1 && first && last && first[0] === last[0] && first[1] === last[1]) {
    points.pop();
  }
  const errors = polygonProblems(points);
  return errors.length ? { ok: false, errors } : { ok: true, points };
}

/**
 * Every reason `points` (an open ring) can't be searched. Empty means valid. Checked:
 * point count, coordinate range, antimeridian crossing (an edge spanning more than 180° of
 * longitude), consecutive duplicates, zero area, and any two edges crossing or touching.
 */
export function polygonProblems(points: readonly LngLat[]): string[] {
  if (points.length > MAX_POLYGON_POINTS) return [POLYGON_MESSAGES.tooMany];

  const inRange = points.every(
    ([lng, lat]) => lng >= -180 && lng <= 180 && Math.abs(lat) <= MERCATOR_MAX_LAT,
  );
  if (!inRange) return [POLYGON_MESSAGES.range];

  const ring = points.filter((p, i) => {
    const prev = points[(i - 1 + points.length) % points.length]!;
    return i === 0 || p[0] !== prev[0] || p[1] !== prev[1];
  });
  if (ring.length < MIN_POLYGON_POINTS) return [POLYGON_MESSAGES.tooFew];
  if (ring.length !== points.length) return [POLYGON_MESSAGES.selfIntersecting];

  const edges = ring.map((p, i) => [p, ring[(i + 1) % ring.length]!] as const);
  if (edges.some(([a, b]) => Math.abs(a[0] - b[0]) > 180)) return [POLYGON_MESSAGES.antimeridian];

  // Checked in Web Mercator, where the shape is drawn. Crossing edges first: a bow-tie's two lobes
  // cancel to zero area, and "edges cross" is the accurate explanation for it.
  const projected = ring.map(toMercator);
  if (hasSelfIntersection(projected)) return [POLYGON_MESSAGES.selfIntersecting];
  if (Math.abs(signedArea(projected)) < 1e-9) return [POLYGON_MESSAGES.zeroArea];
  return [];
}

/**
 * Area-weighted centroid, computed in Web Mercator (where the shape is drawn) and returned as
 * lng/lat. For a concave shape it can fall outside the polygon; it is still the shape's center of
 * mass on the map. Input must be a valid polygon (see polygonProblems).
 */
export function polygonCentroid(points: readonly LngLat[]): GeoPoint {
  const p = points.map(toMercator);
  let area2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i]!;
    const [x2, y2] = p[(i + 1) % p.length]!;
    const cross = x1 * y2 - x2 * y1;
    area2 += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  const [lng, lat] = fromMercator([cx / (3 * area2), cy / (3 * area2)]);
  return { lat, lng };
}

/** Bounding box `[minLng, minLat, maxLng, maxLat]` of the points. */
export function polygonBBox(points: readonly LngLat[]): [number, number, number, number] {
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

// --- geometry in Web Mercator (unit sphere; only ratios and signs matter here) ---

type XY = [number, number];

const toMercator = ([lng, lat]: LngLat): XY => [
  (lng * Math.PI) / 180,
  Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];

const fromMercator = ([x, y]: XY): LngLat => [
  (x * 180) / Math.PI,
  ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI,
];

function signedArea(p: readonly XY[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i]!;
    const [x2, y2] = p[(i + 1) % p.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

const EPS = 1e-12;

function orientation(a: XY, b: XY, c: XY): number {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return Math.abs(v) < EPS ? 0 : Math.sign(v);
}

const onSegment = (a: XY, b: XY, p: XY): boolean =>
  Math.min(a[0], b[0]) - EPS <= p[0] &&
  p[0] <= Math.max(a[0], b[0]) + EPS &&
  Math.min(a[1], b[1]) - EPS <= p[1] &&
  p[1] <= Math.max(a[1], b[1]) + EPS;

/** Whether segments ab and cd share any point (crossing, touching or overlapping). */
function segmentsMeet(a: XY, b: XY, c: XY, d: XY): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (
    (o1 === 0 && onSegment(a, b, c)) ||
    (o2 === 0 && onSegment(a, b, d)) ||
    (o3 === 0 && onSegment(c, d, a)) ||
    (o4 === 0 && onSegment(c, d, b))
  );
}

/**
 * Any two edges meeting, other than neighbours at their shared vertex. Neighbours that fold back
 * onto each other (a spike) also count. O(n²), fine for n ≤ MAX_POLYGON_POINTS.
 */
function hasSelfIntersection(p: readonly XY[]): boolean {
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      const c = p[j]!;
      const d = p[(j + 1) % n]!;
      const neighbours = j === i + 1 || (i === 0 && j === n - 1);
      if (!neighbours) {
        if (segmentsMeet(a, b, c, d)) return true;
        continue;
      }
      // Neighbours share a vertex by design. They only meet improperly when they fold back onto
      // each other: collinear and pointing the same way from the shared vertex (a spike).
      const [shared, before, after] = j === i + 1 ? [b, a, d] : [a, b, c];
      const dot =
        (before[0] - shared[0]) * (after[0] - shared[0]) +
        (before[1] - shared[1]) * (after[1] - shared[1]);
      if (orientation(before, shared, after) === 0 && dot > 0) return true;
    }
  }
  return false;
}
