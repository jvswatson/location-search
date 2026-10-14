import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer } from 'testcontainers';
import type { TestProject } from 'vitest/node';

// Same image as docker-compose, so tests exercise the exact PostGIS build we ship.
const DB_CONTEXT = path.resolve(import.meta.dirname, '../../../../docker/db');
const IMAGE = 'location-search-db:test';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

export async function setup(project: TestProject): Promise<void> {
  // Docker layer caching makes repeat builds near-instant.
  await GenericContainer.fromDockerfile(DB_CONTEXT).build(IMAGE, { deleteOnExit: false });
  container = await new PostgreSqlContainer(IMAGE)
    .withDatabase('airports_test')
    .withUsername('test')
    .withPassword('test')
    .start();
  project.provide('databaseUrl', container.getConnectionUri());
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
