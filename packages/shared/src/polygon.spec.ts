import { describe, expect, it } from 'vitest';
import {
  formatPolygonParam,
  type LngLat,
  MAX_POLYGON_POINTS,
  parsePolygonParam,
  polygonBBox,
  polygonCentroid,
  POLYGON_MESSAGES,
  polygonProblems,
} from './polygon.js';

const square: LngLat[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

/** A regular n-gon of radius 10° around (0, 0): always simple. */
const ngon = (n: number): LngLat[] =>
  Array.from({ length: n }, (_, i) => [
    10 * Math.cos((2 * Math.PI * i) / n),
    10 * Math.sin((2 * Math.PI * i) / n),
  ]);

describe('formatPolygonParam / parsePolygonParam', () => {
  it('round-trips at 5 decimals, leaving the ring open', () => {
    const points: LngLat[] = [
      [-0.1234567, 51.5],
      [0.5, 51.5],
      [0.2, 51.9],
    ];
    const raw = formatPolygonParam(points);
    expect(raw).toBe('-0.12346,51.5;0.5,51.5;0.2,51.9');
    expect(parsePolygonParam(raw)).toEqual({
      ok: true,
      points: [
        [-0.12346, 51.5],
        [0.5, 51.5],
        [0.2, 51.9],
      ],
    });
  });

  it('accepts and drops an explicit closing point', () => {
    expect(parsePolygonParam('0,0;10,0;10,10;0,10;0,0')).toEqual({ ok: true, points: square });
  });

  it.each(['0,0;10,0;abc,1', '0,0;10;10,10', '0,0;10,0,5;10,10', '0,0;;10,10', ' '])(
    'rejects malformed input %j',
    (raw) => {
      const result = parsePolygonParam(raw);
      expect(result.ok).toBe(false);
    },
  );

  it('reports which point is malformed', () => {
    expect(parsePolygonParam('0,0;10,0;x,1')).toEqual({
      ok: false,
      errors: ['polygon point 3 must be "lng,lat" with numbers'],
    });
  });

  it('rejects an oversized input before parsing every point', () => {
    const raw = Array.from({ length: 500 }, () => '1,1').join(';');
    expect(parsePolygonParam(raw)).toEqual({ ok: false, errors: [POLYGON_MESSAGES.tooMany] });
  });
});

describe('polygonProblems', () => {
  it('accepts simple convex and concave polygons', () => {
    expect(polygonProblems(square)).toEqual([]);
    const lShape: LngLat[] = [
      [0, 0],
      [10, 0],
      [10, 3],
      [3, 3],
      [3, 10],
      [0, 10],
    ];
    expect(polygonProblems(lShape)).toEqual([]);
    expect(polygonProblems([...square].reverse())).toEqual([]); // either winding
  });

  it(`accepts exactly ${MAX_POLYGON_POINTS} points and rejects more`, () => {
    expect(polygonProblems(ngon(MAX_POLYGON_POINTS))).toEqual([]);
    expect(polygonProblems(ngon(MAX_POLYGON_POINTS + 1))).toEqual([POLYGON_MESSAGES.tooMany]);
  });

  it.each<[string, LngLat[]]>([
    [
      'two points',
      [
        [0, 0],
        [1, 1],
      ],
    ],
    [
      'three points, two identical',
      [
        [0, 0],
        [5, 5],
        [5, 5],
      ],
    ],
  ])('needs at least three distinct points (%s)', (_label, points) => {
    expect(polygonProblems(points)).toEqual([POLYGON_MESSAGES.tooFew]);
  });

  it.each<[string, LngLat[]]>([
    [
      'longitude past 180',
      [
        [170, 0],
        [181, 0],
        [175, 5],
      ],
    ],
    [
      'latitude past the Mercator limit',
      [
        [0, 80],
        [10, 80],
        [5, 86],
      ],
    ],
    [
      'the pole',
      [
        [0, -90],
        [10, -80],
        [-10, -80],
      ],
    ],
  ])('rejects out-of-range coordinates (%s)', (_label, points) => {
    expect(polygonProblems(points)).toEqual([POLYGON_MESSAGES.range]);
  });

  it.each<[string, LngLat[]]>([
    [
      'an edge across ±180',
      [
        [170, 0],
        [-170, 0],
        [-170, 10],
        [170, 10],
      ],
    ],
    [
      'the closing edge across ±180',
      [
        [-170, 0],
        [-175, 10],
        [175, 10],
        [175, 0],
      ],
    ],
  ])('rejects antimeridian crossings (%s)', (_label, points) => {
    expect(polygonProblems(points)).toEqual([POLYGON_MESSAGES.antimeridian]);
  });

  it('accepts a polygon touching ±180 without crossing it', () => {
    expect(
      polygonProblems([
        [170, 0],
        [180, 0],
        [180, 10],
        [170, 10],
      ] as LngLat[]),
    ).toEqual([]);
  });

  it('rejects a flat polygon (all points on one map line)', () => {
    // Constant latitude is a straight line in both lng/lat and Web Mercator.
    expect(
      polygonProblems([
        [0, 10],
        [5, 10],
        [10, 10],
      ] as LngLat[]),
    ).toEqual([POLYGON_MESSAGES.selfIntersecting]);
  });

  it('judges straightness on the map (Web Mercator), not in lng/lat', () => {
    // On a lng/lat line, but on the Mercator map these three points form a thin triangle.
    expect(
      polygonProblems([
        [0, 0],
        [5, 5],
        [10, 10],
      ] as LngLat[]),
    ).toEqual([]);
  });

  it.each<[string, LngLat[]]>([
    [
      'bow-tie (two edges cross)',
      [
        [0, 0],
        [10, 10],
        [10, 0],
        [0, 10],
      ],
    ],
    [
      'figure-eight',
      [
        [0, 0],
        [4, 4],
        [8, 0],
        [8, 8],
        [4, 4],
        [0, 8],
      ],
    ],
    [
      'a vertex touching another edge',
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [5, 0],
        [0, 10],
      ],
    ],
    [
      'a spike folding back on itself',
      [
        [0, 0],
        [10, 0],
        [5, 0],
        [5, 10],
      ],
    ],
    [
      'repeated non-consecutive vertex',
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 0],
        [-10, 10],
      ],
    ],
    [
      'overlapping collinear edges',
      [
        [0, 0],
        [10, 0],
        [10, 5],
        [2, 0],
        [0, 5],
      ],
    ],
  ])('rejects self-intersecting rings: %s', (_label, points) => {
    expect(polygonProblems(points)).toEqual([POLYGON_MESSAGES.selfIntersecting]);
  });

  it('accepts collinear vertices along a straight edge', () => {
    expect(
      polygonProblems([
        [0, 0],
        [5, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ] as LngLat[]),
    ).toEqual([]);
  });

  it('rejects a consecutive duplicate point', () => {
    expect(
      polygonProblems([
        [0, 0],
        [10, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ] as LngLat[]),
    ).toEqual([POLYGON_MESSAGES.selfIntersecting]);
  });
});

describe('polygonCentroid', () => {
  it('is the middle of a square straddling the equator', () => {
    const c = polygonCentroid([
      [-10, -10],
      [10, -10],
      [10, 10],
      [-10, 10],
    ] as LngLat[]);
    expect(c.lng).toBeCloseTo(0, 9);
    expect(c.lat).toBeCloseTo(0, 9);
  });

  it('is the vertex average of a triangle near the equator (projection nearly linear)', () => {
    const c = polygonCentroid([
      [0, 0],
      [3, 0],
      [0, 3],
    ] as LngLat[]);
    expect(c.lng).toBeCloseTo(1, 6);
    expect(c.lat).toBeCloseTo(1, 2);
  });

  it('is computed in Web Mercator: a box spanning 40–60°N centres above 50°N', () => {
    // Equal lat steps are taller on the map further north, so the map centre sits higher.
    const c = polygonCentroid([
      [0, 40],
      [10, 40],
      [10, 60],
      [0, 60],
    ] as LngLat[]);
    expect(c.lng).toBeCloseTo(5, 9);
    expect(c.lat).toBeGreaterThan(50);
    expect(c.lat).toBeLessThan(51.5);
  });

  it('can fall outside a concave polygon (an L)', () => {
    const lShape: LngLat[] = [
      [0, 0],
      [10, 0],
      [10, 1],
      [1, 1],
      [1, 10],
      [0, 10],
    ];
    const c = polygonCentroid(lShape);
    // Inside the L's bounding box but in the empty corner, not on the L itself.
    expect(c.lng).toBeGreaterThan(1);
    expect(c.lat).toBeGreaterThan(1);
  });
});

describe('polygonBBox', () => {
  it('spans the points', () => {
    expect(
      polygonBBox([
        [-3, 51],
        [2, 50],
        [0, 53],
      ]),
    ).toEqual([-3, 50, 2, 53]);
  });
});
