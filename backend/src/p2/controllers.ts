import { Public } from '../common/decorators.js';
import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseFilters,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { P2Access } from './access.js';
import { AirportsService } from './airports.service.js';
import { BookingsService } from './bookings.service.js';
import {
  AirportQueryDto,
  BookingQueryDto,
  CabinDto,
  ConfirmCancellationDto,
  CreateBookingDto,
  CreateFlightDto,
  HoldDto,
  PageDto,
  SearchFlightsDto,
  UpdateCabinDto,
  UpdateFlightDto,
} from './dto.js';
import { FlightsService } from './flights.service.js';
import { P2ErrorFilter } from './errors.js';

@ApiTags('Airports')
@UseFilters(P2ErrorFilter)
@ApiResponse({ status: 400, description: 'Invalid airport query' })
@Public()
@Controller('airports')
export class AirportsController {
  constructor(private readonly airports: AirportsService) {}
  @Get(':code')
  byCode(@Param('code') code: string) { return this.airports.byCode(code); }
  @Get()
  @ApiOperation({ summary: 'FLT-02: Look up official airport reference data' })
  find(@Query() q: AirportQueryDto) {
    return this.airports.find(q);
  }
}
@ApiTags('Flights')
@UseFilters(P2ErrorFilter)
@ApiResponse({ status: 400, description: 'Invalid input' })
@ApiResponse({
  status: 401,
  description: 'Verified P1 authentication required for private routes',
})
@ApiResponse({
  status: 403,
  description: 'Assigned airline moderator required',
})
@ApiResponse({ status: 404, description: 'Flight or cabin not found' })
@ApiResponse({ status: 409, description: 'Inventory or booking conflict' })
@Controller('flights')
export class FlightsController {
  constructor(
    private readonly flights: FlightsService,
    private readonly bookings: BookingsService,
  ) {}
  @Post()
  @UseGuards(P2Access)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'FLT-03: Create assigned airline flight' })
  create(@Body() dto: CreateFlightDto, @Req() req: any) {
    return this.flights.create(dto, req.p2Principal);
  }
  @Public()
  @Get('search')
  @ApiOperation({
    summary:
      'FLT-11, FLT-12, FLT-15: Search one-way or round-trip flights by airport-local dates',
  })
  search(@Query() q: SearchFlightsDto) {
    return this.flights.search(q);
  }
  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'FLT-17: Retrieve flight details, inventory and policy snapshot',
  })
  get(@Param('id') id: string) {
    return this.flights.details(id);
  }
  @Patch(':id')
  @UseGuards(P2Access)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'FLT-05: Change schedule and queue passenger notifications',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFlightDto,
    @Req() req: any,
  ) {
    return this.bookings.updateSchedule(id, dto, req.p2Principal);
  }
  @Post(':id/cancel')
  @UseGuards(P2Access)
  @ApiCookieAuth()
  @ApiOperation({
    summary:
      'FLT-06: Cancel flight and affected itineraries, requesting refunds',
  })
  cancel(
    @Param('id') id: string,
    @Body() dto: ConfirmCancellationDto,
    @Req() req: any,
  ) {
    return this.bookings.cancelFlight(id, req.p2Principal);
  }
  @Post(':id/cabins')
  @UseGuards(P2Access)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'FLT-04: Add cabin inventory' })
  cabin(@Param('id') id: string, @Body() dto: CabinDto, @Req() req: any) {
    return this.flights.cabin(id, dto, req.p2Principal);
  }
  @Patch(':id/cabins/:cabinId')
  @UseGuards(P2Access)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'FLT-04, FLT-05: Update cabin capacity and pricing',
  })
  updateCabin(
    @Param('id') id: string,
    @Param('cabinId') cabinId: string,
    @Body() dto: UpdateCabinDto,
    @Req() req: any,
  ) {
    return this.flights.cabin(id, dto, req.p2Principal, cabinId);
  }
  @Get(':id/bookings')
  @UseGuards(P2Access)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'FLT-29: Paginated bookings for assigned airline flight',
  })
  manifest(@Param('id') id: string, @Query() q: PageDto, @Req() req: any) {
    return this.bookings.manifest(id, req.p2Principal, q);
  }
  @Get(':id/passengers/export')
  @UseGuards(P2Access)
  @ApiCookieAuth()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="passengers.csv"')
  @ApiOperation({
    summary: 'FLT-29: Export confirmed passenger manifest as CSV',
  })
  export(@Param('id') id: string, @Req() req: any) {
    return this.bookings.exportPassengers(id, req.p2Principal);
  }
}
@ApiTags('Flight bookings')
@ApiCookieAuth()
@UseGuards(P2Access)
@UseFilters(P2ErrorFilter)
@ApiResponse({ status: 400, description: 'Invalid booking input' })
@ApiResponse({
  status: 401,
  description: 'Verified P1 authentication required',
})
@ApiResponse({
  status: 403,
  description: 'Booking ownership or registered-user restriction',
})
@ApiResponse({ status: 404, description: 'Booking not found' })
@ApiResponse({
  status: 409,
  description: 'Hold, inventory, payment or cancellation conflict',
})
@ApiResponse({
  status: 503,
  description: 'Required integration unavailable',
})
@Controller('flight-bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}
  @Post('hold')
  @ApiOperation({
    summary: 'FLT-22: Reserve seats temporarily on one or two legs',
  })
  hold(@Body() dto: HoldDto, @Req() req: any) {
    return this.bookings.hold(dto, req.p2Principal);
  }
  @Post()
  @ApiOperation({
    summary:
      'FLT-19, FLT-21, FLT-22: Create pending-payment booking from owned active hold',
  })
  create(@Body() dto: CreateBookingDto, @Req() req: any) {
    return this.bookings.create(dto, req.p2Principal);
  }
  @Get()
  @ApiOperation({ summary: 'FLT-25: List own booking history' })
  list(@Query() q: BookingQueryDto, @Req() req: any) {
    return this.bookings.list(req.p2Principal, q);
  }
  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'FLT-21, FLT-25: Retrieve own booking and price summary',
  })
  get(@Param('id') id: string, @Req() req: any) {
    return this.bookings.get(id, req.p2Principal);
  }
  @Post(':id/cancel')
  @ApiOperation({
    summary: 'FLT-26: Cancel own booking according to its accepted policy',
  })
  cancel(
    @Param('id') id: string,
    @Body() dto: ConfirmCancellationDto,
    @Req() req: any,
  ) {
    return this.bookings.cancel(id, req.p2Principal);
  }
  @Get(':id/cancellation-quote')
  @ApiOperation({
    summary: 'FLT-26: Preview outbound-tier refund before confirmation',
  })
  quote(@Param('id') id: string, @Req() req: any) {
    return this.bookings.cancellationQuote(id, req.p2Principal);
  }
  @Get(':id/e-ticket')
  @ApiOperation({
    summary: 'FLT-23: Download PDF e-ticket after verified payment',
  })
  ticket(@Param('id') id: string, @Req() req: any) {
    return this.bookings.ticket(id, req.p2Principal);
  }
}
