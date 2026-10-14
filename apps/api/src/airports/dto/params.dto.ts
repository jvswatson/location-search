import { DEFAULT_NEAREST_K, MAX_NEAREST_K, type WithinRequest } from '@location-search/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { polygonCoordinateErrors } from '../../geo/polygon.js';

const ICAO_PATTERN = /^[A-Z0-9]{4}$/;
const ICAO_MESSAGE = (field: string) => `${field} must be a 4-character ICAO code`;
const upperTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class IcaoParamDto {
  @ApiProperty({ description: 'ICAO code (case-insensitive).', example: 'EGLL' })
  @Transform(upperTrim)
  @IsString()
  @Matches(ICAO_PATTERN, { message: ICAO_MESSAGE('icao') })
  icao: string;
}

export class NearestQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_NEAREST_K, default: DEFAULT_NEAREST_K })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_NEAREST_K)
  k?: number;
}

export class DistanceQueryDto {
  @ApiProperty({ example: 'EGLL' })
  @Transform(upperTrim)
  @IsString()
  @Matches(ICAO_PATTERN, { message: ICAO_MESSAGE('from') })
  from: string;

  @ApiProperty({ example: 'KJFK' })
  @Transform(upperTrim)
  @IsString()
  @Matches(ICAO_PATTERN, { message: ICAO_MESSAGE('to') })
  to: string;
}

@ValidatorConstraint({ name: 'polygonCoordinates' })
class PolygonCoordinatesConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return polygonCoordinateErrors(value).length === 0;
  }

  defaultMessage(args: ValidationArguments): string {
    return polygonCoordinateErrors(args.value).join('; ');
  }
}

/** GeoJSON Polygon body for POST /airports/within. Edges are geodesics (PostGIS geography). */
export class WithinRequestDto implements WithinRequest {
  @ApiProperty({ enum: ['Polygon'] })
  @Equals('Polygon', { message: "type must be 'Polygon'" })
  type: 'Polygon';

  @ApiProperty({
    description:
      'Linear rings of [lng, lat] positions; the first is the exterior, any others are holes. Each ring is closed and has at least 4 positions.',
    type: 'array',
    items: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
    example: [
      [
        [-1, 51],
        [1, 51],
        [1, 52],
        [-1, 52],
        [-1, 51],
      ],
    ],
  })
  @Validate(PolygonCoordinatesConstraint)
  coordinates: [number, number][][];
}
