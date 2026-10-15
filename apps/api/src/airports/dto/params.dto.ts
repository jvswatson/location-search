import { DEFAULT_NEAREST_K, MAX_NEAREST_K } from '@location-search/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

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
