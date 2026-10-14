import type { DataSource } from 'typeorm';
import { connectTestDataSource } from '../helpers/data-source.js';

describe('migrations', () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = await connectTestDataSource();
  });

  afterAll(async () => {
    await ds.runMigrations(); // leave the schema applied for any later suites
    await ds.destroy();
  });

  const tableExists = async () =>
    (await ds.query(`SELECT to_regclass('public.airports') IS NOT NULL AS exists`))[0].exists;

  it('creates the airports table, extensions and indexes', async () => {
    await ds.runMigrations();
    expect(await tableExists()).toBe(true);

    const extensions = await ds.query(`SELECT extname FROM pg_extension`);
    expect(extensions.map((e: { extname: string }) => e.extname)).toEqual(
      expect.arrayContaining(['postgis', 'pg_trgm']),
    );

    const indexes = await ds.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'airports'`);
    expect(indexes.map((i: { indexname: string }) => i.indexname)).toEqual(
      expect.arrayContaining([
        'airports_geog_gist',
        'airports_search_vector_gin',
        'airports_name_trgm',
        'airports_city_trgm',
        'airports_iata_code',
        'airports_country',
        'airports_altitude_ft',
      ]),
    );
  });

  it('generates search_vector from codes, name, city and country', async () => {
    await ds.query(`
      INSERT INTO airports (icao_code, iata_code, name, city, country, altitude_ft, geog)
      VALUES ('EGLL', 'LHR', 'Heathrow', 'London', 'England', 82,
              ST_SetSRID(ST_MakePoint(-0.461, 51.477), 4326)::geography)
    `);
    const [row] = await ds.query(
      `SELECT search_vector @@ to_tsquery('simple', 'lhr') AS by_code,
              search_vector @@ to_tsquery('simple', 'london') AS by_city
         FROM airports WHERE icao_code = 'EGLL'`,
    );
    expect(row).toEqual({ by_code: true, by_city: true });
    await ds.query(`DELETE FROM airports`);
  });

  it('rejects malformed codes', async () => {
    await expect(
      ds.query(`
        INSERT INTO airports (icao_code, name, city, country, altitude_ft, geog)
        VALUES ('egll', 'x', 'x', 'x', 0, ST_MakePoint(0, 1)::geography)
      `),
    ).rejects.toThrow(/check constraint/);
  });

  it('reverts cleanly', async () => {
    await ds.undoLastMigration();
    expect(await tableExists()).toBe(false);
  });
});
