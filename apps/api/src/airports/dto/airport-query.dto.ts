import {
  DEFAULT_PAGE_LIMIT,
  MAX_COUNTRIES,
  MAX_PAGE_LIMIT,
  MAX_POLYGON_POINTS,
  parsePolygonParam,
  MAX_QUERY_LENGTH,
  MAX_RADIUS_MI,
  MIN_RADIUS_MI,
  RESPONSE_FORMATS,
  type ResponseFormat,
  SORT_FIELDS,
  type SortField,
  type SortOrder,
} from '@location-search/shared';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from 'class-validator';
import { parseBBox } from '../../geo/coordinates.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** 'true'/'false' → boolean; anything else passes through and fails @IsBoolean. */
const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

/** `?country=A` arrives as a string, `?country=A&country=B` as an array. */
const toArray = ({ value }: { value: unknown }) =>
  (Array.isArray(value) ? value : [value]).map((v) => (typeof v === 'string' ? v.trim() : v));

const bboxErrors = (value: unknown): string[] => {
  if (typeof value !== 'string') return ['bbox must be a single string'];
  const parsed = parseBBox(value);
  return parsed.ok ? [] : parsed.errors;
};

@ValidatorConstraint({ name: 'bbox' })
class BBoxConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return bboxErrors(value).length === 0;
  }

  defaultMessage(args: ValidationArguments): string {
    return bboxErrors(args.value).join('; ');
  }
}

const polygonErrors = (value: unknown): string[] => {
  if (typeof value !== 'string') return ['polygon must be a single string'];
  const parsed = parsePolygonParam(value);
  return parsed.ok ? [] : parsed.errors;
};

/** Validates `polygon` with the same shared rules the web client applies before sending. */
@ValidatorConstraint({ name: 'polygon' })
class PolygonConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return polygonErrors(value).length === 0;
  }

  defaultMessage(args: ValidationArguments): string {
    return polygonErrors(args.value).join('; ');
  }
}

/** Filters shared by GET /airports and GET /airports/points (see AirportFilters). */
export class AirportFiltersQueryDto {
  @ApiPropertyOptional({
    description:
      'Free text. Exact ICAO/IATA match ranks first, then word-prefix full-text match, then fuzzy (typo-tolerant) name/city match.',
    maxLength: MAX_QUERY_LENGTH,
    example: 'heathrow',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_QUERY_LENGTH)
  q?: string;

  @ApiPropertyOptional({
    description: `Exact country name; repeat for several (matches any). At most ${MAX_COUNTRIES}.`,
    type: [String],
    example: ['France', 'Spain'],
  })
  @IsOptional()
  @Transform(toArray)
  @ArrayMaxSize(MAX_COUNTRIES, { message: `country accepts at most ${MAX_COUNTRIES} values` })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  country?: string[];

  @ApiPropertyOptional({ description: 'Exact IATA code (case-insensitive).', example: 'LHR' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^[A-Z0-9]{3}$/, { message: 'iata must be 3 letters or digits' })
  iata?: string;

  @ApiPropertyOptional({
    description: 'Only airports with (true) or without (false) an IATA code.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasIata?: boolean;

  @ApiPropertyOptional({ description: 'Minimum altitude in feet (inclusive).', example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minAltitudeFt?: number;

  @ApiPropertyOptional({ description: 'Maximum altitude in feet (inclusive).', example: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxAltitudeFt?: number;

  @ApiPropertyOptional({
    description: 'Center latitude; requires lng and radiusMi.',
    example: 51.5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({
    description: 'Center longitude; requires lat and radiusMi.',
    example: -0.12,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({
    description: 'Radius in miles around (lat, lng).',
    minimum: MIN_RADIUS_MI,
    maximum: MAX_RADIUS_MI,
    example: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(MIN_RADIUS_MI)
  @Max(MAX_RADIUS_MI)
  radiusMi?: number;

  @ApiPropertyOptional({
    description:
      'Bounding box `minLng,minLat,maxLng,maxLat` (no antimeridian wrap). Not combinable with lat/lng/radiusMi. Distances (and the default distance sort) are measured from its midpoint, returned as meta.center.',
    example: '-10,35,5,60',
  })
  @IsOptional()
  @Validate(BBoxConstraint)
  bbox?: string;

  @ApiPropertyOptional({
    description: `Polygon as \`lng,lat;lng,lat;…\` (3–${MAX_POLYGON_POINTS} points; a repeated closing point is allowed). Edges are straight on the Web Mercator map; it must not self-intersect or cross the antimeridian. Not combinable with lat/lng/radiusMi or bbox. Distances are measured from its centroid, returned as meta.center.`,
    example: '-1,51;1,51;0.5,52;-0.5,52',
  })
  @IsOptional()
  @Validate(PolygonConstraint)
  polygon?: string;

  @ApiPropertyOptional({
    description:
      'Response format; `geojson` (or `Accept: application/geo+json`) returns a FeatureCollection.',
    enum: RESPONSE_FORMATS,
  })
  @IsOptional()
  @IsIn(RESPONSE_FORMATS)
  format?: ResponseFormat;
}

export class AirportSearchQueryDto extends AirportFiltersQueryDto {
  @ApiPropertyOptional({
    description:
      'Defaults to relevance when q is set, else distance when a center is set, else name. Ties break on ICAO.',
    enum: SORT_FIELDS,
  })
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sort?: SortField;

  @ApiPropertyOptional({
    description: 'Defaults to desc for relevance, asc otherwise.',
    enum: ['asc', 'desc'],
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: SortOrder;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_LIMIT, default: DEFAULT_PAGE_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit?: number;
}
