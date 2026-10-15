import { describe, expect, it } from 'vitest';
import { type LngLat, MAX_POLYGON_POINTS, POLYGON_MESSAGES } from '@location-search/shared';
import { ANTIMERIDIAN_ERROR } from './geo';
import { addVertex, finishDraft, friendlyPolygonError } from './polygonDraft';

const add = (draft: LngLat[], lat: number, lng: number) => addVertex(draft, { lat, lng });

describe('addVertex', () => {
  it('adds points rounded to 5 decimals', () => {
    expect(add([], 51.1234567, -0.1234567)).toEqual({ ok: true, draft: [[-0.12346, 51.12346]] });
  });

  it('ignores a point equal to the previous one (the second click of a double-click)', () => {
    const draft: LngLat[] = [
      [0, 0],
      [10, 0],
    ];
    expect(add(draft, 0, 10)).toEqual({ ok: true, draft });
  });

  it('wraps the first point from another world copy into −180…180', () => {
    expect(add([], 10, 370)).toEqual({ ok: true, draft: [[10, 10]] });
  });

  it('keeps later points in the world copy nearest the previous point', () => {
    // Drawing on the copy east of the main world: raw longitudes 365, 375 → 5, 15.
    const first = add([], 0, 365);
    expect(first).toEqual({ ok: true, draft: [[5, 0]] });
    expect(add([[5, 0]], 10, 375)).toEqual({
      ok: true,
      draft: [
        [5, 0],
        [15, 10],
      ],
    });
  });

  it.each([
    ['east across ±180', [[170, 0]] as LngLat[], 190],
    ['west across ±180', [[-170, 0]] as LngLat[], -190],
  ])('refuses a point whose edge would cross the antimeridian (%s)', (_label, draft, lng) => {
    expect(add(draft, 5, lng)).toEqual({ ok: false, error: ANTIMERIDIAN_ERROR });
  });

  it('clamps latitude to the map (Web Mercator) range', () => {
    const result = add([], 89, 0);
    expect(result.ok && result.draft[0]![1]).toBeCloseTo(85.05113, 5);
  });

  it(`refuses point ${MAX_POLYGON_POINTS + 1}`, () => {
    const full = Array.from({ length: MAX_POLYGON_POINTS }, (_, i) => [i / 10, 0] as LngLat);
    expect(add(full, 5, 50)).toEqual({
      ok: false,
      error: `An outline can have at most ${MAX_POLYGON_POINTS} points.`,
    });
  });
});

describe('finishDraft', () => {
  const triangle: LngLat[] = [
    [0, 0],
    [10, 0],
    [5, 8],
  ];

  it('returns a valid outline as the polygon', () => {
    expect(finishDraft(triangle)).toEqual({ ok: true, polygon: triangle });
  });

  it('explains why an outline can’t be used, in plain words', () => {
    expect(
      finishDraft([
        [0, 0],
        [10, 0],
      ]),
    ).toEqual({
      ok: false,
      error: 'Add at least 3 points to outline an area.',
    });
    expect(
      finishDraft([
        [0, 0],
        [10, 10],
        [10, 0],
        [0, 10],
      ]),
    ).toEqual({
      ok: false,
      error: "The outline can't cross or touch itself. Undo the last point or move it.",
    });
  });

  it('maps every shared message to friendly text', () => {
    for (const message of Object.values(POLYGON_MESSAGES)) {
      expect(friendlyPolygonError(message)).not.toBe(message);
    }
  });
});
