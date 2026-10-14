export type BBox = [minLng: number, minLat: number, maxLng: number, maxLat: number];
export type Position = [lng: number, lat: number];

export const isLng = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180;

export const isLat = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90;

export type BBoxParse = { ok: true; bbox: BBox } | { ok: false; errors: string[] };

/**
 * Parses `minLng,minLat,maxLng,maxLat`, returning the box or every problem found. No antimeridian
 * wrap in v1, so min must be strictly less than max on both axes.
 */
export function parseBBox(raw: string): BBoxParse {
  const parts = raw.split(',').map((p) => p.trim());
  if (parts.length !== 4 || parts.some((p) => p === '')) {
    return {
      ok: false,
      errors: ['bbox must be four comma-separated numbers: minLng,minLat,maxLng,maxLat'],
    };
  }
  const [minLng, minLat, maxLng, maxLat] = parts.map(Number) as BBox;
  const errors: string[] = [];
  if (!isLng(minLng) || !isLng(maxLng)) errors.push('bbox longitudes must be between -180 and 180');
  if (!isLat(minLat) || !isLat(maxLat)) errors.push('bbox latitudes must be between -90 and 90');
  if (errors.length === 0) {
    if (minLng >= maxLng) errors.push('bbox minLng must be less than maxLng');
    if (minLat >= maxLat) errors.push('bbox minLat must be less than maxLat');
  }
  return errors.length
    ? { ok: false, errors }
    : { ok: true, bbox: [minLng, minLat, maxLng, maxLat] };
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Mean Earth radius (IUGG), meters. */
export const EARTH_RADIUS_M = 6_371_008.8;

/** Spherical great-circle distance in meters. */
export function haversineMeters([lng1, lat1]: Position, [lng2, lat2]: Position): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Longer than any geodesic on the WGS84 spheroid (~20,004 km): "matches everything". */
export const MAX_GEODESIC_M = 20_100_000;

const SAMPLES_PER_EDGE = 64;
/** Covers the sphere-vs-spheroid difference (< 0.6%) between this and PostGIS geography. */
const SPHEROID_MARGIN = 1.01;

export interface CoveringCircle {
  center: Position;
  radiusM: number;
}

/**
 * A circle guaranteed to contain the whole lng/lat rectangle, so the geography GIST index can
 * prefilter a bbox search with ST_DWithin before the exact lng/lat comparison. (Casting the box
 * itself to geography would give it great-circle edges and change which points are inside.)
 *
 * The farthest point of the box from its center lies on the boundary unless the box contains the
 * center's antipode. The boundary is sampled, and each sample's distance is padded by half the
 * sample spacing (triangle inequality), so the bound holds between samples too.
 */
export function bboxCoveringCircle([minLng, minLat, maxLng, maxLat]: BBox): CoveringCircle {
  const center: Position = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
  const antipodeLng = center[0] > 0 ? center[0] - 180 : center[0] + 180;
  const antipode: Position = [antipodeLng, -center[1]];
  if (
    antipode[0] >= minLng &&
    antipode[0] <= maxLng &&
    antipode[1] >= minLat &&
    antipode[1] <= maxLat
  ) {
    return { center, radiusM: MAX_GEODESIC_M };
  }

  let farthest = 0;
  for (let i = 0; i <= SAMPLES_PER_EDGE; i++) {
    const t = i / SAMPLES_PER_EDGE;
    const lng = minLng + (maxLng - minLng) * t;
    const lat = minLat + (maxLat - minLat) * t;
    for (const p of [
      [lng, minLat],
      [lng, maxLat],
      [minLng, lat],
      [maxLng, lat],
    ] as Position[]) {
      farthest = Math.max(farthest, haversineMeters(center, p));
    }
  }
  // Longest gap between samples: along the equator-most parallel, or along a meridian.
  const lngStep = toRad((maxLng - minLng) / SAMPLES_PER_EDGE);
  const latStep = toRad((maxLat - minLat) / SAMPLES_PER_EDGE);
  const halfGap = (EARTH_RADIUS_M * Math.max(lngStep, latStep)) / 2;

  return { center, radiusM: Math.min(MAX_GEODESIC_M, (farthest + halfGap) * SPHEROID_MARGIN) };
}
