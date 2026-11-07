import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Airline, AirlineSchema } from '../airlines/schemas/airline.schema.js';
import { P2AccessModule } from './access.js';
import { AirportsService } from './airports.service.js';
import { BookingsService } from './bookings.service.js';
import {
  AirportsController,
  BookingsController,
  FlightsController,
} from './controllers.js';
import { FlightsService } from './flights.service.js';
import { P2Rules } from './rules.js';
import {
  AirportSchema,
  BookingSchema,
  FlightSchema,
  HoldSchema,
  P2EventSchema,
} from './schemas.js';

@Module({
  imports: [
    P2AccessModule,
    MongooseModule.forFeature([
      { name: Airline.name, schema: AirlineSchema },
      { name: 'Airport', schema: AirportSchema },
      { name: 'Flight', schema: FlightSchema },
      { name: 'SeatHold', schema: HoldSchema },
      { name: 'FlightBooking', schema: BookingSchema },
      { name: 'P2Event', schema: P2EventSchema },
    ]),
  ],
  controllers: [AirportsController, FlightsController, BookingsController],
  providers: [AirportsService, FlightsService, BookingsService, P2Rules],
  exports: [
    AirportsService,
    FlightsService,
    BookingsService,
    P2Rules,
    P2AccessModule,
  ],
})
export class P2Module {}
