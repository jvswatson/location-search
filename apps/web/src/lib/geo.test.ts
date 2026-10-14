import { describe, expect, it } from 'vitest';
import { MAX_RADIUS_MI, MIN_RADIUS_MI } from '@location-search/shared';
import {
  circleBounds,
  clampRadius,
  destinationPoint,
  handlePosition,
  haversineMi,
  pointsBounds,
  radiusFromHandle,
  roundCoord,
  wrapLng,
} from './geo';

const JFK = { lat: 40.6413, lng: -73.7781 };
const LHR = { lat: 51.47, lng: -0.4543 };

describe('haversineMi', () => {
  it('measures JFK to LHR at roughly 3,450 miles', () => {
    expect(haversineMi(JFK, LHR)).toBeGreaterThan(3430);
    expect(haversineMi(JFK, LHR)).toBeLessThan(3470);
  });

  it('is zero for identical points and symmetric', () => {
    expect(haversineMi(JFK, JFK)).toBe(0);
    expect(haversineMi(JFK, LHR)).toBeCloseTo(haversineMi(LHR, JFK), 9);
  });
});

describe('destinationPoint', () => {
  it('lands at the requested distance', () => {
    for (const bearing of [0, 90, 180, 270, 33]) {
      expect(haversineMi(JFK, destinationPoint(JFK, bearing, 250))).toBeCloseTo(250, 3);
    }
  });

  it('wraps longitude across the antimeridian', () => {
    const p = destinationPoint({ lat: 0, lng: 179.9 }, 90, 100);
    expect(p.lng).toBeLessThan(0);
  });
});

describe('handle round trip', () => {
  it('recovers the radius from the handle position', () => {
    for (const r of [1, 10, 50, 333, 1000, 3000]) {
      expect(radiusFromHandle(JFK, handlePosition(JFK, r))).toBe(r);
    }
  });

  it('places the handle due east of the center', () => {
    expect(handlePosition(JFK, 50).lng).toBeGreaterThan(JFK.lng);
  });

  it('rounds to whole miles and clamps to the allowed range', () => {
    expect(radiusFromHandle(JFK, destinationPoint(JFK, 90, 49.6))).toBe(50);
    expect(radiusFromHandle(JFK, JFK)).toBe(MIN_RADIUS_MI);
    expect(radiusFromHandle(JFK, destinationPoint(JFK, 90, 9000))).toBe(MAX_RADIUS_MI);
  });
});

describe('helpers', () => {
  it('clampRadius', () => {
    expect(clampRadius(0)).toBe(MIN_RADIUS_MI);
    expect(clampRadius(99999)).toBe(MAX_RADIUS_MI);
    expect(clampRadius(12.4)).toBe(12);
  });

  it('wrapLng and roundCoord', () => {
    expect(wrapLng(190)).toBeCloseTo(-170);
    expect(wrapLng(-181)).toBeCloseTo(179);
    expect(roundCoord(1.23456789)).toBe(1.23457);
  });

  it('circleBounds contains the center and spans the radius', () => {
    const [[s, w], [n, e]] = circleBounds(JFK, 100);
    expect(s).toBeLessThan(JFK.lat);
    expect(n).toBeGreaterThan(JFK.lat);
    expect(w).toBeLessThan(JFK.lng);
    expect(e).toBeGreaterThan(JFK.lng);
    expect(haversineMi({ lat: s, lng: JFK.lng }, JFK)).toBeCloseTo(100, 3);
  });

  it('pointsBounds', () => {
    expect(pointsBounds([])).toBeNull();
    expect(pointsBounds([JFK, LHR])).toEqual([
      [JFK.lat, JFK.lng],
      [LHR.lat, LHR.lng],
    ]);
  });
});
