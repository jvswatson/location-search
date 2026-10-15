import type {
  AirportDto,
  AirportPointDto,
  CountryCount,
  DistanceResponse,
  ErrorResponse,
  HealthResponse,
  NearestResponse,
  GeoPoint,
  PageMeta,
  Paginated,
  PointsResponse,
  WithinResponse,
} from '@location-search/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Swagger needs classes; these mirror (and are type-checked against) the shared contract.

export class AirportDoc implements AirportDto {
  @ApiProperty({ example: 'EGLL' }) icaoCode: string;
  @ApiProperty({ example: 'LHR', nullable: true, type: String }) iataCode: string | null;
  @ApiProperty({ example: 'Heathrow' }) name: string;
  @ApiProperty({ example: 'London' }) city: string;
  @ApiProperty({ example: 'Engalnd' }) country: string;
  @ApiProperty({ example: 82 }) altitudeFt: number;
  @ApiProperty({ example: 51.477 }) lat: number;
  @ApiProperty({ example: -0.461 }) lng: number;
  @ApiPropertyOptional({ description: 'Miles from the search center (0.1 precision).' })
  distanceMi?: number;
}

export class AirportPointDoc implements AirportPointDto {
  @ApiProperty() icaoCode: string;
  @ApiProperty() lat: number;
  @ApiProperty() lng: number;
}

export class GeoPointDoc implements GeoPoint {
  @ApiProperty() lat: number;
  @ApiProperty() lng: number;
}

export class PageMetaDoc implements PageMeta {
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() pageCount: number;
  @ApiPropertyOptional({
    type: GeoPointDoc,
    description: 'Point distanceMi is measured from: the radius center or the bbox midpoint.',
  })
  center?: GeoPointDoc;
}

export class PaginatedAirportsDoc implements Paginated<AirportDto> {
  @ApiProperty({ type: [AirportDoc] }) data: AirportDoc[];
  @ApiProperty({ type: PageMetaDoc }) meta: PageMetaDoc;
}

export class PointsResponseDoc implements PointsResponse {
  @ApiProperty({ type: [AirportPointDoc] }) data: AirportPointDoc[];
  @ApiProperty() total: number;
}

export class WithinResponseDoc implements WithinResponse {
  @ApiProperty({ type: [AirportDoc] }) data: AirportDoc[];
  @ApiProperty() total: number;
}

export class NearestResponseDoc implements NearestResponse {
  @ApiProperty({ type: AirportDoc }) origin: AirportDoc;
  @ApiProperty({ type: [AirportDoc] }) data: AirportDoc[];
}

export class DistanceResponseDoc implements DistanceResponse {
  @ApiProperty({ example: 'EGLL' }) from: string;
  @ApiProperty({ example: 'KJFK' }) to: string;
  @ApiProperty({ example: 3451.2 }) distanceMi: number;
}

export class CountryCountDoc implements CountryCount {
  @ApiProperty({ example: 'France' }) country: string;
  @ApiProperty({ example: 120 }) count: number;
}

export class HealthResponseDoc implements HealthResponse {
  @ApiProperty({ enum: ['ok', 'error'] }) status: 'ok' | 'error';
  @ApiProperty({ enum: ['up', 'down'] }) database: 'up' | 'down';
  @ApiProperty({ nullable: true, type: String, example: '3.6.4' }) postgis: string | null;
}

export class ErrorResponseDoc implements ErrorResponse {
  @ApiProperty({ example: 400 }) statusCode: number;
  @ApiProperty({ example: 'Bad Request' }) error: string;
  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: ['radiusMi must not be greater than 3000'],
  })
  message: string | string[];
}
