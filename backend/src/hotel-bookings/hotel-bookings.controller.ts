import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors, CurrentUser, Roles } from '../common/decorators.js';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe.js';
import { Role } from '../common/roles.js';
import type { JwtUser } from '../common/roles.js';
import { CreateHotelBookingDto } from './dto/create-hotel-booking.dto.js';
import { HotelBookingQueryDto } from './dto/hotel-booking-query.dto.js';
import { HotelBookingsService } from './hotel-bookings.service.js';

@ApiTags('Hotel bookings')
@ApiCookieAuth()
@Controller('hotel-bookings')
@Roles(Role.USER)
export class HotelBookingsController {
  constructor(private readonly bookings: HotelBookingsService) {}

  @ApiOperation({ summary: 'HTL-16, HTL-18: book one or more rooms; holds them for 10 minutes as one Pending Payment reservation' })
  @Post()
  @ApiErrors(
    400,
    401,
    403,
    [404, 'Hotel not found'],
    [409, 'Room is unavailable'],
  )
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateHotelBookingDto) {
    return this.bookings.create(user, dto);
  }

  @ApiOperation({ summary: 'HTL-20: my hotel reservations grouped as Upcoming, Past and Cancelled' })
  @Get()
  @ApiErrors(401, 403)
  findAll(@CurrentUser() user: JwtUser, @Query() query: HotelBookingQueryDto) {
    return this.bookings.findAll(user, query);
  }

  @ApiOperation({ summary: 'HTL-17, HTL-20: one of my reservations with its reference and policy snapshot' })
  @Get(':id')
  @ApiErrors(400, 401, 403, [404, 'Hotel booking not found'])
  findOne(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.bookings.findOne(id, user);
  }

  @ApiOperation({ summary: 'HTL-21, PAY-03: cancel my Confirmed reservation; refund follows the accepted cancellation policy' })
  @Post(':id/cancel')
  @ApiErrors(
    400,
    401,
    403,
    [404, 'Hotel booking not found'],
    [409, 'Booking cannot be cancelled'],
  )
  cancel(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.bookings.cancel(id, user);
  }

  @ApiOperation({ summary: 'HTL-21, PAY-03: preview the refund before cancelling' })
  @Get(':id/cancellation-quote')
  @ApiErrors(400, 401, 403, [404, 'Hotel booking not found'])
  cancellationQuote(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.bookings.cancellationPreview(id, user);
  }
}

@ApiTags('Hotel bookings')
@ApiCookieAuth()
@Controller('hotels')
export class HotelReservationsController {
  constructor(private readonly bookings: HotelBookingsService) {}

  @ApiOperation({ summary: 'HTL-22: reservations of a hotel (moderator of that hotel or admin)' })
  @Get(':hotelId/reservations')
  @Roles(Role.ADMIN, Role.HOTEL_MOD)
  @ApiErrors(400, 401, 403, [404, 'Hotel not found'])
  findForHotel(
    @Param('hotelId', ParseObjectIdPipe) hotelId: string,
    @CurrentUser() user: JwtUser,
    @Query() query: HotelBookingQueryDto,
  ) {
    return this.bookings.findForHotel(hotelId, user, query);
  }
}
