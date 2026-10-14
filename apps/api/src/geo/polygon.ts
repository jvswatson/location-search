import { isLat, isLng } from './coordinates.js';

/** Generous cap: a hand-drawn map polygon has tens of vertices. */
export const MAX_POLYGON_POSITIONS = 10_000;

/**
 * Structural checks for a GeoJSON Polygon's `coordinates` (RFC 7946 §3.1.6): at least one ring,
 * each ring closed with ≥ 4 positions, every position [lng, lat] in range. Returns the problems
 * found (empty when valid). Topology (self-intersection) is checked by PostGIS.
 */
export function polygonCoordinateErrors(coordinates: unknown): string[] {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return ['coordinates must be a non-empty array of linear rings'];
  }
  const errors: string[] = [];
  let positions = 0;

  coordinates.forEach((ring: unknown, r) => {
    const label = r === 0 ? 'exterior ring' : `ring ${r}`;
    if (!Array.isArray(ring)) {
      errors.push(`${label} must be an array of positions`);
      return;
    }
    positions += ring.length;
    if (ring.length < 4) errors.push(`${label} must have at least 4 positions`);

    const badIndex = ring.findIndex(
      (p: unknown) => !Array.isArray(p) || p.length !== 2 || !isLng(p[0]) || !isLat(p[1]),
    );
    if (badIndex >= 0) {
      errors.push(
        `${label} position ${badIndex} must be [lng, lat] with lng in [-180, 180] and lat in [-90, 90]`,
      );
      return;
    }
    const first = ring[0] as number[] | undefined;
    const last = ring.at(-1) as number[] | undefined;
    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
      errors.push(`${label} must be closed (first and last positions equal)`);
    }
  });

  if (positions > MAX_POLYGON_POSITIONS) {
    errors.push(`polygon must have at most ${MAX_POLYGON_POSITIONS} positions`);
  }
  return errors;
}
