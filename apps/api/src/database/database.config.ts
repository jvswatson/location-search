import type { DataSourceOptions } from 'typeorm';
import { Airport } from '../airports/airport.entity.js';
import type { AppEnv } from '../config/env.validation.js';
import { InitAirports1760400000000 } from './migrations/1760400000000-init-airports.js';

export const entities = [Airport];

// Listed explicitly rather than globbed so the same list works from src (Vitest) and dist (node).
export const migrations = [InitAirports1760400000000];

type Env = Record<string, string | undefined>;

/**
 * Connection options. `DATABASE_URL` wins when set (Testcontainers hands us a URI); otherwise the
 * discrete POSTGRES_* / DB_* variables are used, matching docker-compose. Callers pass
 * environment that has been through `validateEnv` (see `dbEnvFrom`), which owns the defaults and
 * the production password rule; there is deliberately no fallback password here.
 */
export function dataSourceOptions(env: Env): DataSourceOptions {
  const connection = env.DATABASE_URL
    ? { url: env.DATABASE_URL }
    : {
        host: env.DB_HOST ?? 'localhost',
        port: Number(env.DB_PORT ?? 5432),
        username: env.POSTGRES_USER,
        password: env.POSTGRES_PASSWORD,
        database: env.POSTGRES_DB,
      };

  return {
    type: 'postgres',
    ...connection,
    entities,
    migrations,
    synchronize: false,
    migrationsRun: false,
    logging: env.DB_LOGGING === 'true',
  };
}

/** The database settings of a validated environment, in the string form `dataSourceOptions` takes. */
export function dbEnvFrom(env: AppEnv): Env {
  return {
    DATABASE_URL: env.DATABASE_URL,
    DB_HOST: env.DB_HOST,
    DB_PORT: String(env.DB_PORT),
    POSTGRES_USER: env.POSTGRES_USER,
    POSTGRES_PASSWORD: env.POSTGRES_PASSWORD,
    POSTGRES_DB: env.POSTGRES_DB,
    DB_LOGGING: String(env.DB_LOGGING),
  };
}
