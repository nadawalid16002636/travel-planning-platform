import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators.js';
import { ReferenceService } from './reference.service.js';

/** GEN-12: read-only reference data for search forms and dropdowns. Public. */
@ApiTags('Reference data')
@Public()
@Controller('reference')
export class ReferenceController {
  constructor(private readonly reference: ReferenceService) {}

  @Get('countries')
  @ApiQuery({ name: 'search', required: false })
  @ApiOperation({ summary: 'GEN-12: countries (code, name, currency)' })
  countries(@Query('search') search?: string) {
    return this.reference.countries(search);
  }

  @Get('cities')
  @ApiQuery({ name: 'country', required: false, example: 'EG' })
  @ApiQuery({ name: 'search', required: false })
  @ApiOperation({ summary: 'GEN-12: cities, optionally by country' })
  cities(@Query('country') country?: string, @Query('search') search?: string) {
    return this.reference.cities({ country, search });
  }

  @Get('airports')
  @ApiQuery({ name: 'city', required: false, example: 'cairo' })
  @ApiQuery({ name: 'country', required: false })
  @ApiQuery({ name: 'search', required: false, description: 'IATA code or name' })
  @ApiOperation({ summary: 'GEN-12: airports with IATA code and time zone' })
  airports(@Query('city') city?: string, @Query('country') country?: string, @Query('search') search?: string) {
    return this.reference.airports({ city, country, search });
  }

  @Get('airports/:code')
  @ApiOperation({ summary: 'GEN-12: one airport by IATA code' })
  airport(@Param('code') code: string) {
    return this.reference.airport(code);
  }

  @Get('attractions')
  @ApiQuery({ name: 'city', required: false, example: 'cairo' })
  @ApiQuery({ name: 'search', required: false })
  @ApiOperation({ summary: 'Attractions, optionally by city' })
  attractions(@Query('city') city?: string, @Query('search') search?: string) {
    return this.reference.attractions({ city, search });
  }

  @Get('currencies')
  @ApiOperation({ summary: 'GEN-12: supported currencies' })
  currencies() {
    return this.reference.currencies();
  }
}
