// Owner: P1. Global: inject ReferenceService anywhere to look up / validate airports, cities, countries.
import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Airport, AirportSchema, Attraction, AttractionSchema, City, CitySchema,
  Country, CountrySchema, Currency, CurrencySchema,
} from './schemas/reference.schemas.js';
import { ReferenceController } from './reference.controller.js';
import { ReferenceService } from './reference.service.js';
import { ReferenceSeeder } from './reference.seeder.js';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Country.name, schema: CountrySchema },
      { name: City.name, schema: CitySchema },
      { name: Airport.name, schema: AirportSchema },
      { name: Attraction.name, schema: AttractionSchema },
      { name: Currency.name, schema: CurrencySchema },
    ]),
  ],
  controllers: [ReferenceController],
  providers: [ReferenceService, ReferenceSeeder],
  exports: [ReferenceService, ReferenceSeeder],
})
export class ReferenceModule {}
