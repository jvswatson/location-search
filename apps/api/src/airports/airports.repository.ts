import type { CountryCount } from '@location-search/shared';
import { type LngLat, MERCATOR_MAX_LAT, milesToMeters, polygonBBox } from '@location-search/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { SqlParams } from '../common/sql-params.js';
import { bboxCoveringCircle } from '../geo/coordinates.js';
import {
  type FilterCriteria,
  referencePoint,
  type SearchCriteria,
} from './search/search-criteria.js';
import { SEARCH_STRATEGY, type SearchStrategy } from './search/search-strategy.js';

/** Raw row shape shared by every airport-returning query. */
export interface AirportRow {
  icao_code: string;
  iata_code: string | null;
  name: string;
  city: string;
  country: string;
  altitude_ft: number;
  lat: number;
  lng: number;
  /** Only when the query has a reference point (search center, nearest origin). */
  distance_m?: number;
}

export interface PointRow {
  icao_code: string;
  lat: number;
  lng: number;
}

const AIRPORT_COLUMNS = `a.icao_code, a.iata_code, a.name, a.city, a.country, a.altitude_ft,
  ST_Y(a.geog::geometry) AS lat, ST_X(a.geog::geometry) AS lng`;

/** WKT for a validated open ring (numbers only, closed here). Bound as a single parameter. */
const polygonWkt = (ring: readonly LngLat[]) =>
  `POLYGON((${[...ring, ring[0]!].map(([lng, lat]) => `${lng} ${lat}`).join(', ')}))`;

const geographyPoint = (params: SqlParams, lng: number, lat: number) =>
  `ST_SetSRID(ST_MakePoint(${params.add(lng)}::float8, ${params.add(lat)}::float8), 4326)::geography`;

interface WhereClause {
  /** `WHERE …` (or empty). Every placeholder in `rankSql` and `centerSql` is also used here. */
  sql: string;
  rankSql: string[];
  centerSql?: string;
}

/**
 * All airport SQL lives here. Every value is bound as a positional parameter; the only
 * interpolated strings are fixed fragments chosen by code (columns, directions, operators).
 */
@Injectable()
export class AirportsRepository {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(SEARCH_STRATEGY) private readonly searchStrategy: SearchStrategy,
  ) {}

  /** One page of matches plus the total match count. */
  async search(c: SearchCriteria): Promise<{ rows: AirportRow[]; total: number }> {
    const params = new SqlParams();
    const where = this.where(c, params);
    const filterValues = [...params.values];

    // Distances are measured from the radius center (already bound by the WHERE) or, for a bbox,
    // from its midpoint. The midpoint is bound only now, after `filterValues` was captured, because
    // the count query must not receive a parameter its SQL never references.
    const reference = referencePoint(c);
    const referenceSql =
      where.centerSql ??
      (reference ? geographyPoint(params, reference.lng, reference.lat) : undefined);
    const select = referenceSql
      ? `${AIRPORT_COLUMNS}, ST_Distance(a.geog, ${referenceSql}) AS distance_m`
      : AIRPORT_COLUMNS;
    const limit = params.add(c.limit);
    const offset = params.add((c.page - 1) * c.limit);

    const [rows, [count]] = await Promise.all([
      this.ds.query<AirportRow[]>(
        `SELECT ${select} FROM airports a ${where.sql}
         ORDER BY ${this.orderBy(c, where.rankSql)}
         LIMIT ${limit} OFFSET ${offset}`,
        params.values,
      ),
      this.ds.query<{ total: number }[]>(
        `SELECT count(*)::int AS total FROM airports a ${where.sql}`,
        filterValues,
      ),
    ]);
    return { rows, total: count?.total ?? 0 };
  }

  /** Every match, minimal columns, in a stable order. */
  async points(c: FilterCriteria): Promise<PointRow[]> {
    const params = new SqlParams();
    const where = this.where(c, params);
    return this.ds.query<PointRow[]>(
      `SELECT a.icao_code, ST_Y(a.geog::geometry) AS lat, ST_X(a.geog::geometry) AS lng
         FROM airports a ${where.sql}
        ORDER BY a.icao_code`,
      params.values,
    );
  }

  async findByIcao(icao: string): Promise<AirportRow | null> {
    const [row] = await this.ds.query<AirportRow[]>(
      `SELECT ${AIRPORT_COLUMNS} FROM airports a WHERE a.icao_code = $1`,
      [icao],
    );
    return row ?? null;
  }

  /**
   * The k airports closest to `origin` (excluding it), closest first. `<->` on geography is an
   * index-assisted KNN scan over the GIST index; the reported distance is the spheroidal
   * ST_Distance, consistent with radius search.
   */
  async nearest(origin: string, k: number): Promise<AirportRow[]> {
    return this.ds.query<AirportRow[]>(
      `WITH o AS MATERIALIZED (SELECT geog FROM airports WHERE icao_code = $1)
       SELECT * FROM (
         SELECT ${AIRPORT_COLUMNS}, ST_Distance(a.geog, (SELECT geog FROM o)) AS distance_m
           FROM airports a
          WHERE a.icao_code <> $1 AND EXISTS (SELECT 1 FROM o)
          ORDER BY a.geog <-> (SELECT geog FROM o)
          LIMIT $2
       ) n
       ORDER BY n.distance_m, n.icao_code`,
      [origin, k],
    );
  }

  /** Spheroidal distance between two airports, with which of them exist. */
  async distance(
    from: string,
    to: string,
  ): Promise<{ hasFrom: boolean; hasTo: boolean; meters: number | null }> {
    const [row] = await this.ds.query<
      { has_from: boolean; has_to: boolean; meters: number | null }[]
    >(
      `SELECT f.id IS NOT NULL AS has_from, t.id IS NOT NULL AS has_to,
              ST_Distance(f.geog, t.geog) AS meters
         FROM (SELECT 1) one
         LEFT JOIN airports f ON f.icao_code = $1
         LEFT JOIN airports t ON t.icao_code = $2`,
      [from, to],
    );
    return { hasFrom: !!row?.has_from, hasTo: !!row?.has_to, meters: row?.meters ?? null };
  }

  async countries(): Promise<CountryCount[]> {
    return this.ds.query<CountryCount[]>(
      `SELECT country, count(*)::int AS count FROM airports GROUP BY country ORDER BY country`,
    );
  }

  private where(c: FilterCriteria, params: SqlParams): WhereClause {
    const conditions: string[] = [];
    let rankSql: string[] = [];
    let centerSql: string | undefined;

    if (c.q) {
      const clause = this.searchStrategy.apply(params, c.q);
      conditions.push(clause.whereSql);
      rankSql = clause.rankSql;
    }
    if (c.countries?.length) conditions.push(`a.country = ANY(${params.add(c.countries)}::text[])`);
    if (c.iata) conditions.push(`a.iata_code = ${params.add(c.iata)}`);
    if (c.hasIata !== undefined) {
      conditions.push(c.hasIata ? 'a.iata_code IS NOT NULL' : 'a.iata_code IS NULL');
    }
    if (c.minAltitudeFt !== undefined) {
      conditions.push(`a.altitude_ft >= ${params.add(c.minAltitudeFt)}::int`);
    }
    if (c.maxAltitudeFt !== undefined) {
      conditions.push(`a.altitude_ft <= ${params.add(c.maxAltitudeFt)}::int`);
    }
    if (c.center) {
      centerSql = geographyPoint(params, c.center.lng, c.center.lat);
      const meters = params.add(milesToMeters(c.center.radiusMi));
      conditions.push(`ST_DWithin(a.geog, ${centerSql}, ${meters}::float8)`);
    }
    if (c.bbox) {
      // Index prefilter with a circle that covers the box, then the exact lng/lat rectangle.
      const [minLng, minLat, maxLng, maxLat] = c.bbox;
      const circle = bboxCoveringCircle(c.bbox);
      const circleCenter = geographyPoint(params, circle.center[0], circle.center[1]);
      conditions.push(
        `ST_DWithin(a.geog, ${circleCenter}, ${params.add(circle.radiusM)}::float8)`,
        `ST_X(a.geog::geometry) BETWEEN ${params.add(minLng)}::float8 AND ${params.add(maxLng)}::float8`,
        `ST_Y(a.geog::geometry) BETWEEN ${params.add(minLat)}::float8 AND ${params.add(maxLat)}::float8`,
      );
    }

    if (c.polygon) {
      // 1. Index prefilter: a circle covering the polygon's bounding box (GIST on geog).
      // 2. Cheap lng/lat bounding-box check.
      // 3. Exact test in Web Mercator (EPSG:3857), where the polygon's edges are drawn straight.
      //    3857 can't represent the poles, so only airports within its latitude range are
      //    transformed; CASE guarantees that order (AND does not).
      const bbox = polygonBBox(c.polygon);
      const [minLng, minLat, maxLng, maxLat] = bbox;
      const circle = bboxCoveringCircle(bbox);
      const circleCenter = geographyPoint(params, circle.center[0], circle.center[1]);
      const wkt = params.add(polygonWkt(c.polygon));
      conditions.push(
        `ST_DWithin(a.geog, ${circleCenter}, ${params.add(circle.radiusM)}::float8)`,
        `ST_X(a.geog::geometry) BETWEEN ${params.add(minLng)}::float8 AND ${params.add(maxLng)}::float8`,
        `ST_Y(a.geog::geometry) BETWEEN ${params.add(minLat)}::float8 AND ${params.add(maxLat)}::float8`,
        `CASE WHEN abs(ST_Y(a.geog::geometry)) < ${MERCATOR_MAX_LAT}
           THEN ST_Covers(
             ST_Transform(ST_GeomFromText(${wkt}::text, 4326), 3857),
             ST_Transform(a.geog::geometry, 3857))
           ELSE false END`,
      );
    }

    return {
      sql: conditions.length ? `WHERE ${conditions.join('\n AND ')}` : '',
      rankSql,
      centerSql,
    };
  }

  private orderBy(c: SearchCriteria, rankSql: string[]): string {
    const dir = c.order === 'desc' ? 'DESC' : 'ASC';
    // Relevance expressions are "higher is better", so the default desc lists best first.
    const keys: Record<SearchCriteria['sort'], string[]> = {
      relevance: rankSql.map((expr) => `${expr} ${dir}`),
      name: [`a.name ${dir}`],
      altitude: [`a.altitude_ft ${dir}`],
      distance: [`distance_m ${dir}`],
      icao: [`a.icao_code ${dir}`],
    };
    const order = keys[c.sort];
    // Unique tie-breaker so pages never overlap or skip rows.
    if (c.sort !== 'icao') order.push('a.icao_code ASC');
    return order.join(', ');
  }
}
