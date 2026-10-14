/** Exact by definition of the international mile. */
export const METERS_PER_MILE = 1609.344;

/** Exact by definition of the international foot (0.3048 m). */
export const FEET_PER_METER = 1 / 0.3048;

export const milesToMeters = (miles: number): number => miles * METERS_PER_MILE;

export const metersToMiles = (meters: number): number => meters / METERS_PER_MILE;

/** Whole feet, as stored in `airports.altitude_ft`. */
export const metersToFeet = (meters: number): number => Math.round(meters * FEET_PER_METER);
