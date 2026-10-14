import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DataSource } from 'typeorm';
import { type CleanAirport, type CleanResult, cleanGadbRows } from './cleaner.js';
import { parseGadbSql } from './gadb-parser.js';

/** Same relative depth from src/ and dist/, and the Docker image keeps the repo layout. */
export const DEFAULT_SOURCE_PATH = path.resolve(
  import.meta.dirname,
  '../../../../../data/gadb_postgresql_create_airports_table.sql',
);

const BATCH_SIZE = 500;
const COLUMNS_PER_ROW = 8;

export async function loadCleanAirports(sourcePath = DEFAULT_SOURCE_PATH): Promise<CleanResult> {
  return cleanGadbRows(parseGadbSql(await readFile(sourcePath, 'latin1')));
}

/** Inserts or updates every airport (keyed by ICAO). Returns the number of rows written. */
export async function upsertAirports(ds: DataSource, airports: CleanAirport[]): Promise<number> {
  await ds.transaction(async (manager) => {
    for (let start = 0; start < airports.length; start += BATCH_SIZE) {
      const batch = airports.slice(start, start + BATCH_SIZE);
      const params: unknown[] = [];
      const tuples = batch.map((a, row) => {
        params.push(a.icaoCode, a.iataCode, a.name, a.city, a.country, a.altitudeFt, a.lon, a.lat);
        const p = (col: number) => `$${row * COLUMNS_PER_ROW + col}`;
        return `(${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)},
          ST_SetSRID(ST_MakePoint(${p(7)}, ${p(8)}), 4326)::geography)`;
      });
      await manager.query(
        `INSERT INTO airports (icao_code, iata_code, name, city, country, altitude_ft, geog)
         VALUES ${tuples.join(',\n')}
         ON CONFLICT (icao_code) DO UPDATE SET
           iata_code = EXCLUDED.iata_code,
           name = EXCLUDED.name,
           city = EXCLUDED.city,
           country = EXCLUDED.country,
           altitude_ft = EXCLUDED.altitude_ft,
           geog = EXCLUDED.geog`,
        params,
      );
    }
  });
  return airports.length;
}

export interface SeedOutcome {
  seeded: boolean;
  written: number;
  dropped: number;
}

/** Seeds from the GADB file. With `ifEmpty`, does nothing when airports already has rows. */
export async function seedAirports(
  ds: DataSource,
  { ifEmpty = false, sourcePath }: { ifEmpty?: boolean; sourcePath?: string } = {},
): Promise<SeedOutcome> {
  if (ifEmpty) {
    const [{ count }] = await ds.query(`SELECT count(*)::int AS count FROM airports`);
    if (count > 0) return { seeded: false, written: 0, dropped: 0 };
  }
  const { airports, dropped } = await loadCleanAirports(sourcePath);
  const written = await upsertAirports(ds, airports);
  return { seeded: true, written, dropped: dropped.length };
}
