import {
  type AirportDto,
  type AirportPointDto,
  type CountryCount,
  DEFAULT_NEAREST_K,
  type DistanceResponse,
  metersToMiles,
  type NearestResponse,
  type Paginated,
  type PointsResponse,
  type WithinRequest,
  type WithinResponse,
} from '@location-search/shared';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { type AirportRow, AirportsRepository, type PointRow } from './airports.repository.js';
import {
  type FilterInput,
  type Resolved,
  resolveFilters,
  resolveSearch,
  type SearchInput,
} from './search/search-criteria.js';

/** Miles rounded to 0.1, the contract's precision for every distance. */
export const roundMiles = (meters: number): number => Math.round(metersToMiles(meters) * 10) / 10;

export function toAirportDto(row: AirportRow): AirportDto {
  const dto: AirportDto = {
    icaoCode: row.icao_code,
    iataCode: row.iata_code,
    name: row.name,
    city: row.city,
    country: row.country,
    altitudeFt: row.altitude_ft,
    lat: row.lat,
    lng: row.lng,
  };
  if (row.distance_m !== undefined && row.distance_m !== null) {
    dto.distanceMi = roundMiles(row.distance_m);
  }
  return dto;
}

const toPointDto = (row: PointRow): AirportPointDto => ({
  icaoCode: row.icao_code,
  lat: row.lat,
  lng: row.lng,
});

function orBadRequest<T>(resolved: Resolved<T>): T {
  if (!resolved.ok) throw new BadRequestException(resolved.errors);
  return resolved.value;
}

@Injectable()
export class AirportsService {
  constructor(private readonly repo: AirportsRepository) {}

  async search(input: SearchInput): Promise<Paginated<AirportDto>> {
    const criteria = orBadRequest(resolveSearch(input));
    const { rows, total } = await this.repo.search(criteria);
    return {
      data: rows.map(toAirportDto),
      meta: {
        total,
        page: criteria.page,
        limit: criteria.limit,
        pageCount: Math.ceil(total / criteria.limit),
      },
    };
  }

  async points(input: FilterInput): Promise<PointsResponse> {
    const rows = await this.repo.points(orBadRequest(resolveFilters(input)));
    return { data: rows.map(toPointDto), total: rows.length };
  }

  async findOne(icao: string): Promise<AirportDto> {
    const row = await this.repo.findByIcao(icao);
    if (!row) throw new NotFoundException(`Airport ${icao} not found`);
    return toAirportDto(row);
  }

  async nearest(icao: string, k = DEFAULT_NEAREST_K): Promise<NearestResponse> {
    const origin = await this.findOne(icao);
    const rows = await this.repo.nearest(icao, k);
    return { origin, data: rows.map(toAirportDto) };
  }

  async distance(from: string, to: string): Promise<DistanceResponse> {
    const { hasFrom, hasTo, meters } = await this.repo.distance(from, to);
    const missing = [!hasFrom && from, !hasTo && to].filter((c): c is string => !!c);
    if (missing.length || meters === null) {
      throw new NotFoundException(`Airport not found: ${[...new Set(missing)].join(', ')}`);
    }
    return { from, to, distanceMi: roundMiles(meters) };
  }

  async within(polygon: WithinRequest): Promise<WithinResponse> {
    // Re-serialize only the validated members: never forward unknown keys to PostGIS.
    const geojson = JSON.stringify({ type: 'Polygon', coordinates: polygon.coordinates });
    const reason = await this.repo.polygonInvalidReason(geojson);
    if (reason) throw new BadRequestException([`polygon is not valid: ${reason}`]);
    const rows = await this.repo.within(geojson);
    return { data: rows.map(toAirportDto), total: rows.length };
  }

  countries(): Promise<CountryCount[]> {
    return this.repo.countries();
  }
}
