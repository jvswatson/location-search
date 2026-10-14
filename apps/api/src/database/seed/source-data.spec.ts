import { loadCleanAirports } from './seeder.js';

// Pins the cleaning outcome for the committed GADB file, so any parser/cleaner change that shifts
// the dataset is caught without Docker.
describe('GADB source file', () => {
  it('cleans 9,300 source rows down to 4,187 airports', async () => {
    const { airports, dropped } = await loadCleanAirports();
    expect(airports.length + dropped.length).toBe(9300);
    expect(airports).toHaveLength(4187);

    const byReason = Object.groupBy(dropped, (d) => d.reason);
    expect(byReason['missing-name']).toHaveLength(5105);
    expect(byReason['missing-coordinates']).toHaveLength(7);
    expect(byReason['known-bad']?.map((d) => d.icaoCode)).toEqual(['PCIS']);
    expect(byReason['invalid-icao']).toBeUndefined();
    expect(byReason['duplicate-icao']).toBeUndefined();
  });

  it('produces valid codes and coordinates for every airport', async () => {
    const { airports } = await loadCleanAirports();
    for (const a of airports) {
      expect(a.icaoCode).toMatch(/^[A-Z0-9]{4}$/);
      if (a.iataCode !== null) expect(a.iataCode).toMatch(/^[A-Z0-9]{3}$/);
      expect(a.name).not.toBe('N/A');
      expect(Math.abs(a.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(a.lon)).toBeLessThanOrEqual(180);
      expect(a.lat === 0 && a.lon === 0).toBe(false);
    }
  });

  it('spot-checks well-known airports', async () => {
    const { airports } = await loadCleanAirports();
    const byIcao = new Map(airports.map((a) => [a.icaoCode, a]));

    expect(byIcao.get('EGLL')).toMatchObject({
      iataCode: 'LHR',
      name: 'Heathrow',
      city: 'London',
      country: 'Engalnd', // source typo, deliberately kept
      altitudeFt: 82,
    });
    expect(byIcao.get('KJFK')).toMatchObject({
      name: 'John F Kennedy International',
      city: 'New York',
    });
    expect(byIcao.get('LFPG')).toMatchObject({ name: 'Charles de Gaulle', city: 'Paris' });
    expect(byIcao.get('KDEN')?.altitudeFt).toBe(5433);
    expect(byIcao.get('NZSP')).toMatchObject({ lat: -90, lon: 0 });
    expect(byIcao.has('PCIS')).toBe(false);
  });
});
