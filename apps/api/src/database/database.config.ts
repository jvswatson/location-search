import type { DataSourceOptions } from 'typeorm';
import { Airport } from '../airports/airport.entity.js';
import { InitAirports1760400000000 } from './migrations/1760400000000-init-airports.js';

export const entities = [Airport];

// Listed explicitly rather than globbed so the same list works from src (Vitest) and dist (node).
export const migrations = [InitAirports1760400000000];

type Env = Record<string, string | undefined>;

/**
 * Connection options from the environment. `DATABASE_URL` wins when set (Testcontainers hands us
 * a URI); otherwise the discrete POSTGRES_* / DB_* variables are used, matching docker-compose.
 */
export function dataSourceOptions(env: Env = process.env): DataSourceOptions {
  const connection = env.DATABASE_URL
    ? { url: env.DATABASE_URL }
    : {
        host: env.DB_HOST ?? 'localhost',
        port: Number(env.DB_PORT ?? 5432),
        username: env.POSTGRES_USER ?? 'airports',
        password: env.POSTGRES_PASSWORD ?? 'airports',
        database: env.POSTGRES_DB ?? 'airports',
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
