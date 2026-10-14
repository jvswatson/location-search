import {
  type AirportDto,
  type AirportFeatureCollection,
  type DistanceResponse,
  GEOJSON_MEDIA_TYPE,
  type NearestResponse,
  type Paginated,
  type PointFeatureCollection,
  type PointsResponse,
  type ResponseFormat,
  type WithinResponse,
} from '@location-search/shared';
import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { airportsToGeoJson, pointsToGeoJson } from '../geo/geojson.js';
import { AirportFiltersQueryDto, AirportSearchQueryDto } from './dto/airport-query.dto.js';
import {
  DistanceQueryDto,
  IcaoParamDto,
  NearestQueryDto,
  WithinRequestDto,
} from './dto/params.dto.js';
import {
  AirportDoc,
  DistanceResponseDoc,
  ErrorResponseDoc,
  NearestResponseDoc,
  PaginatedAirportsDoc,
  PointsResponseDoc,
  WithinResponseDoc,
} from './dto/responses.dto.js';
import { AirportsService } from './airports.service.js';

/**
 * GeoJSON when asked for explicitly (`format=geojson`), or when the Accept header prefers
 * application/geo+json over application/json. `format=json` always wins.
 */
export function wantsGeoJson(
  format: ResponseFormat | undefined,
  req: Pick<Request, 'accepts'>,
): boolean {
  if (format) return format === 'geojson';
  return req.accepts(['application/json', GEOJSON_MEDIA_TYPE]) === GEOJSON_MEDIA_TYPE;
}

@ApiTags('airports')
@ApiBadRequestResponse({ type: ErrorResponseDoc })
@ApiTooManyRequestsResponse({ type: ErrorResponseDoc })
@Controller('airports')
export class AirportsController {
  constructor(private readonly airports: AirportsService) {}

  @Get()
  @ApiOperation({ summary: 'Search airports (paginated). All filters combine with AND.' })
  @ApiProduces('application/json', GEOJSON_MEDIA_TYPE)
  @ApiOkResponse({ type: PaginatedAirportsDoc })
  async search(
    @Query() query: AirportSearchQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Paginated<AirportDto> | AirportFeatureCollection> {
    const { format, ...input } = query;
    const page = await this.airports.search(input);
    if (!wantsGeoJson(format, req)) return page;
    res.type(GEOJSON_MEDIA_TYPE);
    return airportsToGeoJson(page.data, page.meta);
  }

  @Get('points')
  @ApiOperation({ summary: 'Every matching airport as a minimal point (for map pins).' })
  @ApiProduces('application/json', GEOJSON_MEDIA_TYPE)
  @ApiOkResponse({ type: PointsResponseDoc })
  async points(
    @Query() query: AirportFiltersQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PointsResponse | PointFeatureCollection> {
    const { format, ...input } = query;
    const points = await this.airports.points(input);
    if (!wantsGeoJson(format, req)) return points;
    res.type(GEOJSON_MEDIA_TYPE);
    return pointsToGeoJson(points.data, points.total);
  }

  // Static paths are declared before ':icao' so they are not captured by it.
  @Get('distance')
  @ApiOperation({ summary: 'Great-circle (spheroidal) distance between two airports, in miles.' })
  @ApiOkResponse({ type: DistanceResponseDoc })
  @ApiNotFoundResponse({ type: ErrorResponseDoc })
  distance(@Query() { from, to }: DistanceQueryDto): Promise<DistanceResponse> {
    return this.airports.distance(from, to);
  }

  @Post('within')
  @HttpCode(200)
  @ApiOperation({ summary: 'Airports inside a GeoJSON Polygon (geodesic edges).' })
  @ApiOkResponse({ type: WithinResponseDoc })
  within(@Body() body: WithinRequestDto): Promise<WithinResponse> {
    return this.airports.within(body);
  }

  @Get(':icao')
  @ApiOperation({ summary: 'One airport by ICAO code.' })
  @ApiOkResponse({ type: AirportDoc })
  @ApiNotFoundResponse({ type: ErrorResponseDoc })
  findOne(@Param() { icao }: IcaoParamDto): Promise<AirportDto> {
    return this.airports.findOne(icao);
  }

  @Get(':icao/nearest')
  @ApiOperation({ summary: 'The k nearest other airports, closest first.' })
  @ApiOkResponse({ type: NearestResponseDoc })
  @ApiNotFoundResponse({ type: ErrorResponseDoc })
  nearest(
    @Param() { icao }: IcaoParamDto,
    @Query() { k }: NearestQueryDto,
  ): Promise<NearestResponse> {
    return this.airports.nearest(icao, k);
  }
}
