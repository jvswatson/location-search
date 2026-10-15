import { describe, expect, it } from 'vitest';
import {
  ANTIMERIDIAN_ERROR,
  bboxBounds,
  DEGENERATE_RECTANGLE_ERROR,
  parseBBox,
  rectangleFromCorners,
  sameBBox,
} from './geo';

describe('rectangleFromCorners', () => {
  it('orders the corners into [minLng, minLat, maxLng, maxLat] whichever is clicked first', () => {
    const expected = { ok: true, bbox: [-1, 51, 1, 52] };
    expect(rectangleFromCorners({ lat: 51, lng: -1 }, { lat: 52, lng: 1 })).toEqual(expected);
    expect(rectangleFromCorners({ lat: 52, lng: 1 }, { lat: 51, lng: -1 })).toEqual(expected);
    expect(rectangleFromCorners({ lat: 51, lng: 1 }, { lat: 52, lng: -1 })).toEqual(expected);
  });

  it('rounds to 5 decimals', () => {
    expect(rectangleFromCorners({ lat: 51.1234567, lng: -1 }, { lat: 52, lng: 1.0000049 })).toEqual(
      {
        ok: true,
        bbox: [-1, 51.12346, 1.0, 52],
      },
    );
  });

  it('moves a box drawn on another world copy back into −180…180', () => {
    expect(rectangleFromCorners({ lat: 10, lng: 370 }, { lat: 20, lng: 380 })).toEqual({
      ok: true,
      bbox: [10, 10, 20, 20],
    });
    expect(rectangleFromCorners({ lat: 10, lng: -350 }, { lat: 20, lng: -340 })).toEqual({
      ok: true,
      bbox: [10, 10, 20, 20],
    });
  });

  it.each([
    ['east across ±180', { lat: 0, lng: 170 }, { lat: 10, lng: 190 }],
    ['west across ±180', { lat: 0, lng: -170 }, { lat: 10, lng: -190 }],
    ['on a world copy', { lat: 0, lng: 530 }, { lat: 10, lng: 550 }],
  ])('rejects a box that crosses the antimeridian (%s)', (_label, a, b) => {
    expect(rectangleFromCorners(a, b)).toEqual({ ok: false, error: ANTIMERIDIAN_ERROR });
  });

  it('allows a box that touches ±180 without crossing it', () => {
    expect(rectangleFromCorners({ lat: 0, lng: 170 }, { lat: 10, lng: 180 })).toEqual({
      ok: true,
      bbox: [170, 0, 180, 10],
    });
  });

  it.each([
    ['same point', { lat: 5, lng: 5 }, { lat: 5, lng: 5 }],
    ['zero width', { lat: 5, lng: 5 }, { lat: 9, lng: 5 }],
    ['zero height', { lat: 5, lng: 5 }, { lat: 5, lng: 9 }],
  ])('rejects a degenerate box (%s)', (_label, a, b) => {
    expect(rectangleFromCorners(a, b)).toEqual({ ok: false, error: DEGENERATE_RECTANGLE_ERROR });
  });
});

describe('bbox helpers', () => {
  it('converts a bbox to Leaflet bounds', () => {
    expect(bboxBounds([-1, 51, 1, 52])).toEqual([
      [51, -1],
      [52, 1],
    ]);
  });

  it('compares boxes by value', () => {
    expect(sameBBox([1, 2, 3, 4], [1, 2, 3, 4])).toBe(true);
    expect(sameBBox([1, 2, 3, 4], [1, 2, 3, 5])).toBe(false);
    expect(sameBBox(null, null)).toBe(true);
    expect(sameBBox([1, 2, 3, 4], null)).toBe(false);
  });

  it('parses only valid, non-wrapping boxes', () => {
    expect(parseBBox(' -1, 51 ,1,52')).toEqual([-1, 51, 1, 52]);
    expect(parseBBox(null)).toBeNull();
    expect(parseBBox('1,51,-1,52')).toBeNull();
    expect(parseBBox('-1,51,1,91')).toBeNull();
    expect(parseBBox('-1,51,,52')).toBeNull();
  });
});
