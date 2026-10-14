import { describe, expect, it } from 'vitest';
import { metersToFeet, metersToMiles, milesToMeters } from './units.js';

describe('units', () => {
  it('converts miles to meters and back', () => {
    expect(milesToMeters(1)).toBe(1609.344);
    expect(metersToMiles(milesToMeters(250))).toBeCloseTo(250, 10);
  });

  it('rounds meters to whole feet', () => {
    expect(metersToFeet(1656)).toBe(5433); // Denver International
    expect(metersToFeet(0)).toBe(0);
    expect(metersToFeet(-385)).toBe(-1263); // below sea level
  });
});
