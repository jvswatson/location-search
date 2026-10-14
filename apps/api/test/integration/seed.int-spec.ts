import type { DataSource } from 'typeorm';
import { seedAirports } from '../../src/database/seed/seeder.js';
import { connectTestDataSource } from '../helpers/data-source.js';

describe('seedAirports', () => {
  let ds: DataSource;

  const count = async (where = 'true'): Promise<number> =>
    (await ds.query(`SELECT count(*)::int AS n FROM airports WHERE ${where}`))[0].n;

  beforeAll(async () => {
    ds = await connectTestDataSource();
    await ds.runMigrations();
    await ds.query(`TRUNCATE airports`);
  });

  afterAll(async () => {
    await ds.destroy();
  });

  it('loads 4,187 airports into PostGIS', async () => {
    const outcome = await seedAirports(ds);
    expect(outcome).toEqual({ seeded: true, written: 4187, dropped: 5113 });
    expect(await count()).toBe(4187);
  });

  it('stores no placeholder or null-island rows', async () => {
    expect(await count(`name = 'N/A' OR iata_code = 'N/A'`)).toBe(0);
    expect(await count(`ST_X(geog::geometry) = 0 AND ST_Y(geog::geometry) = 0`)).toBe(0);
    expect(await count(`icao_code = 'PCIS'`)).toBe(0);
  });

  it('stores coordinates as lon/lat in SRID 4326', async () => {
    const [jfk] = await ds.query(
      `SELECT ST_Y(geog::geometry) AS lat, ST_X(geog::geometry) AS lon, ST_SRID(geog) AS srid
         FROM airports WHERE icao_code = 'KJFK'`,
    );
    expect(jfk).toEqual({ lat: 40.64, lon: -73.779, srid: 4326 });
  });

  it('places Heathrow within 25 miles of central London', async () => {
    const [{ miles }] = await ds.query(
      `SELECT ST_Distance(geog, ST_MakePoint(-0.1276, 51.5072)::geography) / 1609.344 AS miles
         FROM airports WHERE icao_code = 'EGLL'`,
    );
    expect(miles).toBeGreaterThan(10);
    expect(miles).toBeLessThan(25);
  });

  it('is idempotent: re-running updates in place', async () => {
    await ds.query(`UPDATE airports SET name = 'Stale' WHERE icao_code = 'EGLL'`);
    await seedAirports(ds);
    expect(await count()).toBe(4187);
    const [{ name }] = await ds.query(`SELECT name FROM airports WHERE icao_code = 'EGLL'`);
    expect(name).toBe('Heathrow');
  });

  it('skips with ifEmpty when rows already exist', async () => {
    expect(await seedAirports(ds, { ifEmpty: true })).toEqual({
      seeded: false,
      written: 0,
      dropped: 0,
    });
  });
});
