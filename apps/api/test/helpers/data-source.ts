import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { DataSource } from 'typeorm';
import { inject } from 'vitest';
import { dataSourceOptions } from '../../src/database/database.config.js';

/**
 * Connects to a brand-new database on the shared Testcontainers server. Each suite gets its own
 * database, so suites cannot see each other's rows or schema changes and run order never matters.
 * Pair with `disposeTestDataSource`.
 */
export async function connectTestDataSource(): Promise<DataSource> {
  const serverUrl = new URL(inject('databaseUrl'));
  const database = `test_${randomUUID().replaceAll('-', '')}`;

  await withAdminClient(serverUrl, (client) => client.query(`CREATE DATABASE "${database}"`));

  const url = new URL(serverUrl);
  url.pathname = `/${database}`;
  const ds = new DataSource(dataSourceOptions({ DATABASE_URL: url.toString() }));
  return ds.initialize();
}

/** Closes the connection and drops the suite's database. */
export async function disposeTestDataSource(ds: DataSource | undefined): Promise<void> {
  if (!ds) return;
  const url = new URL(String((ds.options as { url?: string }).url));
  const database = url.pathname.slice(1);
  if (ds.isInitialized) await ds.destroy();
  await withAdminClient(url, (client) =>
    client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`),
  );
}

async function withAdminClient<T>(url: URL, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
