import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ItineraryLinkedBookingDto } from './itinerary-booking.dto.js';
import { DayBudgetCategory } from '../schemas/day-budget-entry.schema.js';

export class DayBudgetEntryResponseDto {
  @ApiProperty({ example: '64b000000000000000000011' })
  _id: string;

  @ApiProperty({ enum: Object.values(DayBudgetCategory) })
  category: DayBudgetCategory;

  @ApiProperty({ minimum: 0 })
  amount: number;

  @ApiProperty({ example: 'EGP' })
  currency: string;

  @ApiPropertyOptional()
  description?: string;
}

export class IntercityTransportEntryResponseDto {
  @ApiProperty({ example: '64b000000000000000000012' })
  _id: string;

  @ApiProperty({ description: 'Transport mode; ITN-16 does not prescribe an enum.' })
  mode: string;

  @ApiProperty({ example: 'cairo' })
  fromCityId: string;

  @ApiProperty({ example: 'alexandria' })
  toCityId: string;

  @ApiProperty({ minimum: 0 })
  amount: number;

  @ApiProperty({ example: 'EGP' })
  currency: string;
}

export class ItineraryActivityCostResponseDto {
  @ApiProperty({ minimum: 0 })
  amount: number;

  @ApiProperty({ example: 'EGP' })
  currency: string;
}

export class ItineraryActivityResponseDto {
  @ApiProperty({ example: '64b000000000000000000013' })
  _id: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  location?: string;

  @ApiPropertyOptional()
  startTime?: string;

  @ApiPropertyOptional()
  endTime?: string;

  @ApiPropertyOptional({ type: ItineraryActivityCostResponseDto })
  cost?: ItineraryActivityCostResponseDto;

  @ApiProperty({ type: [String] })
  images: string[];
}

export class ItineraryBudgetEntryResponseDto {
  @ApiProperty({
    enum: ['food', 'accommodation', 'local_transportation', 'activities', 'intercity_transportation'],
  })
  category: string;

  @ApiProperty({ minimum: 0 })
  amount: number;

  @ApiProperty({ example: 'EGP' })
  currency: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  date?: string;
}

export class ItineraryLegacyDayDataResponseDto {
  @ApiPropertyOptional({ description: 'Unconverted city text from a legacy itinerary.' })
  city?: string;
}

export class ItineraryDayResponseDto {
  @ApiPropertyOptional({ example: '64b000000000000000000010', description: 'Generated MongoDB day subdocument ID; dayOrder remains the route identifier.' })
  _id?: string;

  @ApiProperty({ minimum: 1 })
  order: number;

  @ApiProperty({ type: String, format: 'date-time' })
  date: string;

  @ApiProperty({ type: String, nullable: true, example: 'cairo' })
  cityId: string | null;

  @ApiPropertyOptional()
  notes?: string;

  @ApiProperty({ type: [ItineraryActivityResponseDto] })
  activities: ItineraryActivityResponseDto[];

  @ApiProperty({ type: [String] })
  images: string[];

  @ApiProperty({ type: [DayBudgetEntryResponseDto] })
  budgetEntries: DayBudgetEntryResponseDto[];

  @ApiProperty({ type: [IntercityTransportEntryResponseDto] })
  transportEntries: IntercityTransportEntryResponseDto[];

  @ApiProperty({ type: [ItineraryLinkedBookingDto], description: 'Booking references associated with this day. Booking records remain owned by their original booking service.' })
  bookingAssociations: ItineraryLinkedBookingDto[];

  @ApiPropertyOptional({ type: ItineraryLegacyDayDataResponseDto })
  legacyData?: ItineraryLegacyDayDataResponseDto;
}

export class ItineraryLegacyDataResponseDto {
  @ApiPropertyOptional({ type: [String], description: 'Unconverted destinations from a legacy itinerary.' })
  destinations?: string[];
}

export class ItineraryCloneAttributionResponseDto {
  @ApiProperty({ example: '64b000000000000000000021' })
  itineraryId: string;

  @ApiProperty({ example: '64b000000000000000000022' })
  authorId: string;

  @ApiProperty({ example: 'Alex Morgan' })
  authorName: string;
}

export class ItineraryResponseDto {
  @ApiProperty({ example: '64b000000000000000000001' })
  _id: string;

  @ApiProperty({ example: '64b000000000000000000002' })
  userId: string;

  @ApiProperty({ maxLength: 100 })
  title: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ type: [String], nullable: true, example: ['EG'] })
  countryCodes: string[] | null;

  @ApiProperty({ type: String, format: 'date-time' })
  startDate: string;

  @ApiProperty({ enum: ['private', 'public'] })
  visibility: string;

  @ApiProperty({ enum: ['draft', 'published'] })
  status: string;

  @ApiProperty({ type: [ItineraryDayResponseDto] })
  days: ItineraryDayResponseDto[];

  @ApiProperty({ type: [ItineraryBudgetEntryResponseDto] })
  budgetEntries: ItineraryBudgetEntryResponseDto[];

  @ApiPropertyOptional({ type: ItineraryLegacyDataResponseDto })
  legacyData?: ItineraryLegacyDataResponseDto;

  @ApiPropertyOptional({ type: ItineraryCloneAttributionResponseDto })
  clonedFrom?: ItineraryCloneAttributionResponseDto;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  createdAt?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  updatedAt?: string;

  @ApiPropertyOptional()
  __v?: number;
}

export class PaginatedItinerariesResponseDto {
  @ApiProperty({ type: [ItineraryResponseDto] })
  data: ItineraryResponseDto[];

  @ApiProperty({ minimum: 1, example: 1 })
  page: number;

  @ApiProperty({ minimum: 1, maximum: 10, example: 10 })
  limit: number;

  @ApiProperty({ minimum: 0, example: 12 })
  total: number;
}

export class DeleteItineraryResponseDto {
  @ApiProperty({ enum: [true] })
  deleted: true;

  @ApiProperty({ example: '64b000000000000000000001' })
  id: string;
}
