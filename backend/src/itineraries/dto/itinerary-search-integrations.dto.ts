import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.dto.js';
import { SearchFlightsDto } from '../../p2/dto.js';

export class ItineraryHotelSearchDto extends PaginationQueryDto {
  @ApiProperty({ minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  guests: number;

  @ApiProperty({ minimum: 1, maximum: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  rooms: number;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  amenity?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  minRating?: number;

}

export class ItineraryFlightSearchDto extends OmitType(SearchFlightsDto, [
  'departureAirport',
  'arrivalAirport',
  'departureDate',
  'returnDate',
] as const) {
  @ApiProperty({ example: 'CAI', description: 'Origin airport chosen by the user.' })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  departureAirport: string;

  @ApiPropertyOptional({ example: 'HBE', description: 'Optional destination airport in the itinerary first day city. If omitted, all mapped airports in that city are searched.' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  arrivalAirport?: string;

  @ApiPropertyOptional({ example: '2026-12-01', format: 'date', description: 'Defaults to the first itinerary day.' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  departureDate?: string;

  @ApiPropertyOptional({ example: '2026-12-10', format: 'date', description: 'For round trips, defaults to the last itinerary day.' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  returnDate?: string;

  @ApiPropertyOptional({ enum: ['one-way', 'round-trip'], default: 'one-way' })
  @IsOptional()
  @IsIn(['one-way', 'round-trip'])
  tripType = 'one-way';
}

export class ItineraryHotelSearchResponseDto {
  @ApiProperty({ example: '64b000000000000000000002' })
  itineraryId: string;

  @ApiProperty({ type: Object })
  cityGroup: {
    cityId: string;
    startDayOrder: number;
    endDayOrder: number;
    dayCount: number;
    checkIn: string;
    checkOut: string;
  };

  @ApiProperty({ type: Object })
  location: { cityId: string; city: string; countryCode: string; country: string };

  @ApiProperty({ type: Object, description: 'Result returned by HotelsService.search.' })
  hotels: Record<string, unknown>;
}

export class ItineraryFlightSearchOptionDto {
  @ApiProperty({ type: Object })
  arrivalAirport: Record<string, unknown>;

  @ApiProperty({ type: Object, description: 'Result returned by FlightsService.search.' })
  results: Record<string, unknown>;
}

export class ItineraryFlightSearchResponseDto {
  @ApiProperty({ example: '64b000000000000000000002' })
  itineraryId: string;

  @ApiProperty({ type: Object })
  originAirport: Record<string, unknown>;

  @ApiProperty({ type: Object })
  destinationCity: { cityId: string; name: string; countryCode: string };

  @ApiProperty({ type: String, format: 'date' })
  departureDate: string;

  @ApiProperty({ enum: ['one-way', 'round-trip'] })
  tripType: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  returnDate?: string;

  @ApiProperty({ type: [ItineraryFlightSearchOptionDto] })
  options: ItineraryFlightSearchOptionDto[];
}
