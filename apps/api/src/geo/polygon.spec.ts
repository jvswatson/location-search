import { MAX_POLYGON_POSITIONS, polygonCoordinateErrors } from './polygon.js';

const square = [
  [-1, 51],
  [1, 51],
  [1, 52],
  [-1, 52],
  [-1, 51],
];

describe('polygonCoordinateErrors', () => {
  it('accepts a closed exterior ring, with or without holes', () => {
    expect(polygonCoordinateErrors([square])).toEqual([]);
    const hole = [
      [-0.5, 51.2],
      [0.5, 51.2],
      [0.5, 51.8],
      [-0.5, 51.2],
    ];
    expect(polygonCoordinateErrors([square, hole])).toEqual([]);
  });

  it.each([undefined, null, 'x', [], {}])('rejects non-ring coordinates %j', (value) => {
    expect(polygonCoordinateErrors(value)).toEqual([expect.stringMatching(/non-empty array/)]);
  });

  it('requires at least 4 positions per ring', () => {
    expect(
      polygonCoordinateErrors([
        [
          [0, 0],
          [1, 1],
          [0, 0],
        ],
      ]),
    ).toEqual(['exterior ring must have at least 4 positions']);
  });

  it('requires closed rings', () => {
    expect(polygonCoordinateErrors([square.slice(0, 4).concat([[-1, 51.5]])])).toEqual([
      'exterior ring must be closed (first and last positions equal)',
    ]);
  });

  it('reports the first bad position with its ring and index', () => {
    const bad = square.map((p, i) => (i === 2 ? [200, 52] : p));
    expect(polygonCoordinateErrors([square, bad])).toEqual([
      expect.stringMatching(/^ring 1 position 2 must be \[lng, lat\]/),
    ]);
    expect(polygonCoordinateErrors([[[0, 0, 5], ...square]])[0]).toMatch(/position 0/);
    expect(polygonCoordinateErrors([['x']])).toEqual(
      expect.arrayContaining([expect.stringMatching(/position 0/)]),
    );
    expect(polygonCoordinateErrors(['ring'])).toEqual([
      'exterior ring must be an array of positions',
    ]);
  });

  it('caps the total number of positions', () => {
    const ring = Array.from({ length: MAX_POLYGON_POSITIONS }, (_, i) => [i / 1e4, 0]);
    ring.push(ring[0]!);
    expect(polygonCoordinateErrors([ring])).toEqual([
      `polygon must have at most ${MAX_POLYGON_POSITIONS} positions`,
    ]);
  });
});
