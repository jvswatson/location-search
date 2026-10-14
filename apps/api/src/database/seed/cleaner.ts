import { metersToFeet } from '@location-search/shared';
import type { GadbRow } from './gadb-parser.js';
import { titleCase } from './title-case.js';

/** A cleaned airport, ready to insert. Coordinates are WGS84 decimal degrees. */
export interface CleanAirport {
  icaoCode: string;
  iataCode: string | null;
  name: string;
  city: string;
  country: string;
  altitudeFt: number;
  lat: number;
  lon: number;
}

export type DropReason =
  | 'missing-name'
  | 'missing-coordinates'
  | 'known-bad'
  | 'invalid-icao'
  | 'out-of-range'
  | 'duplicate-icao';

export interface CleanResult {
  airports: CleanAirport[];
  dropped: { icaoCode: string; reason: DropReason }[];
}

/**
 * Rows whose values pass every structural check but are known to be wrong. Each entry says why,
 * so the list can be audited (and shrunk if the source is ever corrected).
 */
export const KNOWN_BAD_ROWS: Readonly<Record<string, string>> = {
  PCIS: 'Canton Island: source longitude is 0.000 W; the island is at about 171.7 W',
};

const NOT_AVAILABLE = 'N/A';

export function cleanGadbRows(rows: GadbRow[]): CleanResult {
  const airports: CleanAirport[] = [];
  const dropped: CleanResult['dropped'] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const reason = dropReason(row, seen);
    if (reason) {
      dropped.push({ icaoCode: row.icaoCode, reason });
      continue;
    }
    seen.add(row.icaoCode);
    airports.push({
      icaoCode: row.icaoCode,
      iataCode: row.iataCode === NOT_AVAILABLE ? null : row.iataCode,
      name: titleCase(row.name),
      city: titleCase(row.city),
      country: titleCase(row.country),
      // The GADB altitude column is in meters.
      altitudeFt: metersToFeet(row.altitudeM),
      lat: row.latDecimal,
      lon: row.lonDecimal,
    });
  }
  return { airports, dropped };
}

function dropReason(row: GadbRow, seen: Set<string>): DropReason | undefined {
  if (row.name === NOT_AVAILABLE || row.name.trim() === '') return 'missing-name';
  if ((row.latDecimal === 0 && row.lonDecimal === 0) || row.latDir === 'U' || row.lonDir === 'U') {
    return 'missing-coordinates';
  }
  if (row.icaoCode in KNOWN_BAD_ROWS) return 'known-bad';
  if (!/^[A-Z0-9]{4}$/.test(row.icaoCode)) return 'invalid-icao';
  if (Math.abs(row.latDecimal) > 90 || Math.abs(row.lonDecimal) > 180) return 'out-of-range';
  if (seen.has(row.icaoCode)) return 'duplicate-icao';
  return undefined;
}
