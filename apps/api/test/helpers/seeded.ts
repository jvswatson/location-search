import type { DataSource } from 'typeorm';
import { AirportsRepository } from '../../src/airports/airports.repository.js';
import { TextSearchStrategy } from '../../src/airports/search/text-search.strategy.js';
import { seedAirports } from '../../src/database/seed/seeder.js';
import { connectTestDataSource } from './data-source.js';

/** A fresh per-suite database with the schema and the full GADB dataset. */
export async function connectSeededDataSource(): Promise<DataSource> {
  const ds = await connectTestDataSource();
  await ds.runMigrations();
  await seedAirports(ds);
  return ds;
}

export const createRepository = (ds: DataSource): AirportsRepository =>
  new AirportsRepository(ds, new TextSearchStrategy());

/** The suite's database URL, for booting the app against it. */
export const databaseUrlOf = (ds: DataSource): string =>
  String((ds.options as { url?: string }).url);
