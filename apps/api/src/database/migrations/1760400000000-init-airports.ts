import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitAirports1760400000000 implements MigrationInterface {
  name = 'InitAirports1760400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // 'simple' text-search config: place names should not be stemmed as English words.
    await queryRunner.query(`
      CREATE TABLE airports (
        id            serial PRIMARY KEY,
        icao_code     char(4) NOT NULL UNIQUE CHECK (icao_code ~ '^[A-Z0-9]{4}$'),
        iata_code     char(3) NULL CHECK (iata_code ~ '^[A-Z0-9]{3}$'),
        name          text NOT NULL CHECK (name <> ''),
        city          text NOT NULL,
        country       text NOT NULL,
        altitude_ft   integer NOT NULL,
        geog          geography(Point, 4326) NOT NULL,
        search_vector tsvector GENERATED ALWAYS AS (
          setweight(to_tsvector('simple', icao_code || ' ' || coalesce(iata_code, '')), 'A') ||
          setweight(to_tsvector('simple', name), 'A') ||
          setweight(to_tsvector('simple', city), 'B') ||
          setweight(to_tsvector('simple', country), 'C')
        ) STORED
      )
    `);

    await queryRunner.query(`CREATE INDEX airports_geog_gist ON airports USING gist (geog)`);
    await queryRunner.query(
      `CREATE INDEX airports_search_vector_gin ON airports USING gin (search_vector)`,
    );
    await queryRunner.query(
      `CREATE INDEX airports_name_trgm ON airports USING gin (name gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX airports_city_trgm ON airports USING gin (city gin_trgm_ops)`,
    );
    await queryRunner.query(`CREATE INDEX airports_iata_code ON airports (iata_code)`);
    await queryRunner.query(`CREATE INDEX airports_country ON airports (country)`);
    await queryRunner.query(`CREATE INDEX airports_altitude_ft ON airports (altitude_ft)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Extensions are left in place: they may be shared with other schemas.
    await queryRunner.query(`DROP TABLE IF EXISTS airports`);
  }
}
