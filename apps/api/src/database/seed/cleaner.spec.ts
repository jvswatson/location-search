import { cleanGadbRows, type DropReason, KNOWN_BAD_ROWS } from './cleaner.js';
import type { GadbRow } from './gadb-parser.js';

const row = (overrides: Partial<GadbRow> = {}): GadbRow => ({
  icaoCode: 'KDEN',
  iataCode: 'DEN',
  name: 'DENVER INTERNATIONAL',
  city: 'DENVER',
  country: 'USA',
  latDeg: 39,
  latMin: 51,
  latSec: 30,
  latDir: 'N',
  lonDeg: 104,
  lonMin: 40,
  lonSec: 1,
  lonDir: 'W',
  altitudeM: 1656,
  latDecimal: 39.858,
  lonDecimal: -104.667,
  ...overrides,
});

describe('cleanGadbRows', () => {
  it('keeps a valid row, title-cases text and converts altitude to feet', () => {
    expect(cleanGadbRows([row()])).toEqual({
      airports: [
        {
          icaoCode: 'KDEN',
          iataCode: 'DEN',
          name: 'Denver International',
          city: 'Denver',
          country: 'USA',
          altitudeFt: 5433,
          lat: 39.858,
          lon: -104.667,
        },
      ],
      dropped: [],
    });
  });

  it("maps an 'N/A' IATA code to null", () => {
    expect(cleanGadbRows([row({ iataCode: 'N/A' })]).airports[0]?.iataCode).toBeNull();
  });

  it.each([
    ['missing-name', { name: 'N/A' }],
    ['missing-name', { name: '  ' }],
    ['missing-coordinates', { latDecimal: 0, lonDecimal: 0 }],
    ['missing-coordinates', { latDir: 'U' }],
    ['missing-coordinates', { lonDir: 'U' }],
    ['known-bad', { icaoCode: 'PCIS' }],
    ['invalid-icao', { icaoCode: 'kden' }],
    ['invalid-icao', { icaoCode: 'KDE' }],
    ['out-of-range', { latDecimal: 91 }],
    ['out-of-range', { lonDecimal: -180.5 }],
  ] as [DropReason, Partial<GadbRow>][])('drops %s (%o)', (reason, overrides) => {
    const result = cleanGadbRows([row(overrides)]);
    expect(result.airports).toEqual([]);
    expect(result.dropped).toEqual([{ icaoCode: overrides.icaoCode ?? 'KDEN', reason }]);
  });

  it('keeps legitimate single-axis zero coordinates (South Pole station)', () => {
    const pole = row({
      icaoCode: 'NZSP',
      latDecimal: -90,
      lonDecimal: 0,
      latDir: 'S',
      lonDir: 'E',
    });
    expect(cleanGadbRows([pole]).airports).toHaveLength(1);
  });

  it('drops a repeated ICAO code, keeping the first', () => {
    const result = cleanGadbRows([row(), row({ name: 'DUPLICATE' })]);
    expect(result.airports.map((a) => a.name)).toEqual(['Denver International']);
    expect(result.dropped).toEqual([{ icaoCode: 'KDEN', reason: 'duplicate-icao' }]);
  });

  it('documents why every known-bad row is excluded', () => {
    for (const reason of Object.values(KNOWN_BAD_ROWS)) expect(reason.length).toBeGreaterThan(10);
  });
});
