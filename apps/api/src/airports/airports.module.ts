import { Module } from '@nestjs/common';
import { AirportsController } from './airports.controller.js';
import { AirportsRepository } from './airports.repository.js';
import { AirportsService } from './airports.service.js';
import { CountriesController } from './countries.controller.js';
import { SEARCH_STRATEGY } from './search/search-strategy.js';
import { TextSearchStrategy } from './search/text-search.strategy.js';

@Module({
  controllers: [AirportsController, CountriesController],
  providers: [
    AirportsService,
    AirportsRepository,
    { provide: SEARCH_STRATEGY, useClass: TextSearchStrategy },
  ],
})
export class AirportsModule {}
