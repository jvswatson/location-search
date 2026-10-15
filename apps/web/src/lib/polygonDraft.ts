import {
  type LngLat,
  MAX_POLYGON_POINTS,
  MERCATOR_MAX_LAT,
  MIN_POLYGON_POINTS,
  POLYGON_MESSAGES,
  polygonProblems,
} from '@location-search/shared';
import { ANTIMERIDIAN_ERROR, type LatLng, roundCoord, wrapLng } from './geo';

/** Friendlier wording for the shared validation messages (the API returns the shared ones). */
const FRIENDLY: Record<string, string> = {
  [POLYGON_MESSAGES.selfIntersecting]:
    "The outline can't cross or touch itself. Undo the last point or move it.",
  [POLYGON_MESSAGES.antimeridian]: ANTIMERIDIAN_ERROR,
  [POLYGON_MESSAGES.tooFew]: `Add at least ${MIN_POLYGON_POINTS} points to outline an area.`,
  [POLYGON_MESSAGES.tooMany]: `An outline can have at most ${MAX_POLYGON_POINTS} points.`,
  [POLYGON_MESSAGES.zeroArea]: 'The outline needs to enclose an area.',
  [POLYGON_MESSAGES.range]: 'Points must stay within the map.',
};

export const friendlyPolygonError = (message: string): string => FRIENDLY[message] ?? message;

export type DraftResult = { ok: true; draft: LngLat[] } | { ok: false; error: string };

/**
 * Adds a clicked point (Leaflet reports unwrapped longitudes on panned world copies, e.g. 190°) to
 * an outline in progress. The first point is wrapped into −180…180; each later point is placed in
 * the world copy nearest the previous point, which keeps the outline continuous. If that puts it
 * outside −180…180, its edge would cross the antimeridian, so it is refused. A point equal to the
 * previous one is ignored: the two clicks of a double-click (which finishes the outline) land on
 * the same spot.
 */
export function addVertex(draft: readonly LngLat[], point: LatLng): DraftResult {
  const prev = draft.at(-1);
  const lng = roundCoord(
    prev ? point.lng - 360 * Math.round((point.lng - prev[0]) / 360) : wrapLng(point.lng),
  );
  const lat = roundCoord(Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, point.lat)));
  if (lng < -180 || lng > 180) return { ok: false, error: ANTIMERIDIAN_ERROR };

  if (prev && prev[0] === lng && prev[1] === lat) return { ok: true, draft: [...draft] };
  if (draft.length >= MAX_POLYGON_POINTS) {
    return { ok: false, error: friendlyPolygonError(POLYGON_MESSAGES.tooMany) };
  }
  return { ok: true, draft: [...draft, [lng, lat]] };
}

export type FinishResult = { ok: true; polygon: LngLat[] } | { ok: false; error: string };

/** Closes the outline if it is a searchable polygon, using the same rules as the API. */
export function finishDraft(draft: readonly LngLat[]): FinishResult {
  const [problem] = polygonProblems(draft);
  return problem
    ? { ok: false, error: friendlyPolygonError(problem) }
    : { ok: true, polygon: [...draft] };
}
