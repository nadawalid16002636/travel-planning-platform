import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiErrors, CurrentUser, Roles } from '../common/decorators.js';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe.js';
import { Role } from '../common/roles.js';
import type { JwtUser } from '../common/roles.js';
import { CreateHotelBookingDto } from './dto/create-hotel-booking.dto.js';
import { HotelBookingQueryDto } from './dto/hotel-booking-query.dto.js';
import { HotelBookingsService } from './hotel-bookings.service.js';

@Controller('hotel-bookings')
@Roles(Role.USER)
export class HotelBookingsController {
  constructor(private readonly bookings: HotelBookingsService) {}

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

  @Get()
  @ApiErrors(401, 403)
  findAll(@CurrentUser() user: JwtUser, @Query() query: HotelBookingQueryDto) {
    return this.bookings.findAll(user, query);
  }

  @Get(':id')
  @ApiErrors(400, 401, 403, [404, 'Hotel booking not found'])
  findOne(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.bookings.findOne(id, user);
  }

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

  @Get(':id/cancellation-quote')
  @ApiErrors(400, 401, 403, [404, 'Hotel booking not found'])
  cancellationQuote(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.bookings.cancellationPreview(id, user);
  }
}

@Controller('hotels')
export class HotelReservationsController {
  constructor(private readonly bookings: HotelBookingsService) {}

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
