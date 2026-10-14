import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { inject } from 'vitest';
import { dataSourceOptions } from '../../src/database/database.config.js';

/** A DataSource connected to the per-run Testcontainers PostGIS instance. */
export async function connectTestDataSource(): Promise<DataSource> {
  const ds = new DataSource(dataSourceOptions({ DATABASE_URL: inject('databaseUrl') }));
  return ds.initialize();
}
