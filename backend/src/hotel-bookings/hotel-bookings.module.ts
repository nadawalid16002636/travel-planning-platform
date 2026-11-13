import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HotelsModule } from '../hotels/hotels.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import {
  HotelBooking,
  HotelBookingSchema,
} from './entities/hotel-booking.entity.js';
import {
  HotelBookingsController,
  HotelReservationsController,
} from './hotel-bookings.controller.js';
import { HotelBookingsService } from './hotel-bookings.service.js';

@Module({
  imports: [
    HotelsModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: HotelBooking.name, schema: HotelBookingSchema },
    ]),
  ],
  controllers: [HotelBookingsController, HotelReservationsController],
  providers: [HotelBookingsService],
  exports: [HotelBookingsService, MongooseModule],
})
export class HotelBookingsModule {}
