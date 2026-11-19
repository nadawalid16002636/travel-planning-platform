import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class AssociateFlightBookingDto {
  @ApiProperty({ example: '64b000000000000000000045' })
  @IsMongoId()
  bookingId: string;
}

export class ItineraryLinkedBookingDto {
  @ApiProperty({ enum: ['flight'] })
  type: 'flight';

  @ApiProperty()
  bookingId: string;

  @ApiProperty({ required: false, example: 'confirmed', description: 'Current status from the source booking service when resolved; confirmed and completed bookings are budgeted.' })
  status?: string;

  @ApiProperty({ required: false, minimum: 0, description: 'Major-unit total. Present only for a confirmed booking whose departure date still matches this itinerary day.' })
  amount?: number;

  @ApiProperty({ required: false, example: 'USD' })
  currency?: string;

  @ApiProperty({ required: false, type: [Object] })
  legs?: Array<Record<string, unknown>>;

  @ApiProperty({ required: false })
  includedInBudget?: boolean;
}
