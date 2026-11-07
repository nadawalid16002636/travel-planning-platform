import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors, Public } from '../common/decorators.js';
import { ReferenceService } from './reference.service.js';
import { AirportsQueryDto } from './dto/reference-query.dto.js';

/** GET /api/airports exactly as listed in section 8.3 of the project description (FLT-03, FLT-11). */
@ApiTags('Reference data')
@Public()
@Controller('airports')
export class AirportsController {
  constructor(private readonly reference: ReferenceService) {}

  @Get()
  @ApiOperation({ summary: 'FLT-03, FLT-11, GEN-12, GEN-05: airports (IATA code, city, country, time zone)' })
  @ApiErrors(400)
  list(@Query() q: AirportsQueryDto) {
    return this.reference.airports(q);
  }

  @Get(':code')
  @ApiOperation({ summary: 'FLT-03: one airport by IATA code' })
  @ApiErrors([404, 'Unknown airport'])
  one(@Param('code') code: string) {
    return this.reference.airport(code);
  }
}
