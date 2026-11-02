import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors, Public } from '../common/decorators.js';
import { PaginationQueryDto } from '../common/pagination.dto.js';
import { ReferenceService } from './reference.service.js';
import { AirportsQueryDto, AttractionsQueryDto, CitiesQueryDto, SearchQueryDto } from './dto/reference-query.dto.js';

/** GEN-12: read-only reference data for search forms and dropdowns. Public. Lists are paginated (GEN-05). */
@ApiTags('Reference data')
@Public()
@Controller('reference')
export class ReferenceController {
  constructor(private readonly reference: ReferenceService) {}

  @Get('countries')
  @ApiOperation({ summary: 'GEN-12, GEN-05: countries (code, name, currency)' })
  @ApiErrors(400)
  countries(@Query() q: SearchQueryDto) {
    return this.reference.countries(q);
  }

  @Get('cities')
  @ApiOperation({ summary: 'GEN-12, GEN-05: cities, optionally by country' })
  @ApiErrors(400)
  cities(@Query() q: CitiesQueryDto) {
    return this.reference.cities(q);
  }

  @Get('airports')
  @ApiOperation({ summary: 'GEN-12, GEN-05: airports with IATA code and time zone (search: IATA code or name)' })
  @ApiErrors(400)
  airports(@Query() q: AirportsQueryDto) {
    return this.reference.airports(q);
  }

  @Get('airports/:code')
  @ApiOperation({ summary: 'GEN-12: one airport by IATA code' })
  @ApiErrors([404, 'Unknown airport'])
  airport(@Param('code') code: string) {
    return this.reference.airport(code);
  }

  @Get('attractions')
  @ApiOperation({ summary: 'GEN-05: attractions, optionally by city' })
  @ApiErrors(400)
  attractions(@Query() q: AttractionsQueryDto) {
    return this.reference.attractions(q);
  }

  @Get('currencies')
  @ApiOperation({ summary: 'GEN-12, GEN-05: supported currencies' })
  @ApiErrors(400)
  currencies(@Query() q: PaginationQueryDto) {
    return this.reference.currencies(q);
  }
}
