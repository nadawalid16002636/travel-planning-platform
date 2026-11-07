import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Airline, AirlineSchema } from '../airlines/schemas/airline.schema';
import { P2AccessModule } from './access';
import { AirportsService } from './airports.service';
import { BookingsService } from './bookings.service';
import {
  AirportsController,
  BookingsController,
  FlightsController,
} from './controllers';
import { FlightsService } from './flights.service';
import { P2Rules } from './rules';
import {
  AirportSchema,
  BookingSchema,
  FlightSchema,
  HoldSchema,
  P2EventSchema,
} from './schemas';

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
