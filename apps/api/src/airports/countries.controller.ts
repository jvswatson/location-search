import type { CountryCount } from '@location-search/shared';
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AirportsService } from './airports.service.js';
import { CountryCountDoc } from './dto/responses.dto.js';

@ApiTags('airports')
@Controller('countries')
export class CountriesController {
  constructor(private readonly airports: AirportsService) {}

  @Get()
  @ApiOperation({ summary: 'Distinct countries with airport counts, sorted by name.' })
  @ApiOkResponse({ type: [CountryCountDoc] })
  list(): Promise<CountryCount[]> {
    return this.airports.countries();
  }
}
