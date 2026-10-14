import {
  type BBox,
  bboxCoveringCircle,
  haversineMeters,
  isLat,
  isLng,
  MAX_GEODESIC_M,
  parseBBox,
} from './coordinates.js';

describe('isLng / isLat', () => {
  it.each([-180, 0, 180])('accepts lng %d', (v) => expect(isLng(v)).toBe(true));
  it.each([-180.0001, 181, NaN, Infinity, '1'])('rejects lng %s', (v) =>
    expect(isLng(v)).toBe(false),
  );
  it.each([-90, 0, 90])('accepts lat %d', (v) => expect(isLat(v)).toBe(true));
  it.each([-91, 90.5, NaN, null])('rejects lat %s', (v) => expect(isLat(v)).toBe(false));
});

describe('parseBBox', () => {
  it('parses four numbers, tolerating spaces', () => {
    expect(parseBBox(' -10, 35.5 ,5,60 ')).toEqual({ ok: true, bbox: [-10, 35.5, 5, 60] });
  });

  it.each(['1,2,3', '1,2,3,4,5', '1,,3,4', ''])('rejects the wrong arity: %j', (raw) => {
    expect(parseBBox(raw)).toEqual({ ok: false, errors: [expect.stringMatching(/four/)] });
  });

  it('rejects non-numeric and out-of-range values', () => {
    expect(parseBBox('a,0,1,1')).toEqual({
      ok: false,
      errors: [expect.stringMatching(/longitudes/)],
    });
    expect(parseBBox('-181,-91,0,0')).toEqual({
      ok: false,
      errors: [expect.stringMatching(/longitudes/), expect.stringMatching(/latitudes/)],
    });
  });

  it('requires min < max on both axes (no antimeridian wrap)', () => {
    expect(parseBBox('170,0,-170,10')).toEqual({
      ok: false,
      errors: ['bbox minLng must be less than maxLng'],
    });
    expect(parseBBox('0,10,1,10')).toEqual({
      ok: false,
      errors: ['bbox minLat must be less than maxLat'],
    });
  });
});

describe('haversineMeters', () => {
  it('is zero for the same point and ~111 km per degree of latitude', () => {
    expect(haversineMeters([1, 2], [1, 2])).toBe(0);
    expect(haversineMeters([0, 0], [0, 1]) / 1000).toBeCloseTo(111.19, 1);
  });

  it('measures half the circumference between antipodes', () => {
    expect(haversineMeters([0, 0], [180, 0])).toBeCloseTo(Math.PI * 6_371_008.8, 0);
  });
});

describe('bboxCoveringCircle', () => {
  // Deterministic pseudo-random points so a failure is reproducible.
  function* pointsIn([minLng, minLat, maxLng, maxLat]: BBox, n = 2000) {
    let seed = 42;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < n; i++) {
      yield [minLng + (maxLng - minLng) * rand(), minLat + (maxLat - minLat) * rand()] as [
        number,
        number,
      ];
    }
    // Corners and edge midpoints, where the farthest point usually is.
    const midLng = (minLng + maxLng) / 2;
    const midLat = (minLat + maxLat) / 2;
    yield* [
      [minLng, minLat],
      [maxLng, maxLat],
      [minLng, maxLat],
      [maxLng, minLat],
      [midLng, minLat],
      [midLng, maxLat],
      [minLng, midLat],
      [maxLng, midLat],
    ] as [number, number][];
  }

  it.each<[string, BBox]>([
    ['a city viewport', [-0.6, 51.2, 0.4, 51.8]],
    ['a box straddling the equator and meridian', [-10, -10, 10, 10]],
    ['a wide high-latitude box', [-170, 50, 170, 80]],
    ['a southern box', [110, -45, 155, -10]],
    ['a pole-touching box', [-30, 60, 30, 90]],
  ])('contains every point of %s', (_label, bbox) => {
    const { center, radiusM } = bboxCoveringCircle(bbox);
    for (const p of pointsIn(bbox)) {
      expect(haversineMeters(center, p)).toBeLessThanOrEqual(radiusM);
    }
  });

  it('stays reasonably tight for a small box', () => {
    const { radiusM } = bboxCoveringCircle([-0.6, 51.2, 0.4, 51.8]);
    expect(radiusM).toBeLessThan(60_000);
  });

  it('covers everything when the box contains its center’s antipode', () => {
    expect(bboxCoveringCircle([-180, -90, 180, 90]).radiusM).toBe(MAX_GEODESIC_M);
  });
});
