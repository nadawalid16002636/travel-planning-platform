import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsPositive,
  IsISO4217CurrencyCode,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const CABINS = [
  'economy',
  'premium-economy',
  'business',
  'first',
] as const;
export class CancellationTierDto {
  @ApiProperty() @IsInt() @Min(0) daysBeforeDeparture: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(100) refundPercent: number;
}
export class CancellationPolicyDto {
  @ApiProperty({ type: [CancellationTierDto] })
  @IsArray()
  @ArrayUnique((t: CancellationTierDto) => t.daysBeforeDeparture)
  @ValidateNested({ each: true })
  @Type(() => CancellationTierDto)
  tiers: CancellationTierDto[];
}
export class CabinDto {
  @ApiProperty({ enum: CABINS }) @IsIn(CABINS) cabinClass: string;
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  capacity: number;
  @ApiProperty({ description: 'Price per seat in currency minor units' })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  priceMinor: number;
  @ApiProperty({ example: 'USD' })
  @IsISO4217CurrencyCode()
  @Matches(/^[A-Z]{3}$/)
  currency: string;
  @ApiProperty() @IsInt() @Min(0) freeBags: number;
  @ApiProperty() @IsNumber() @IsPositive() maxWeightKgPerBag: number;
}
export class UpdateCabinDto extends PartialType(CabinDto, {
  skipNullProperties: false,
}) {}
export class CreateFlightDto {
  @ApiProperty() @IsString() @Matches(/\S/) flightNumber: string;
  @ApiProperty() @IsMongoId() airlineId: string;
  @ApiProperty({ example: 'CAI' })
  @Matches(/^[A-Z]{3}$/)
  departureAirport: string;
  @ApiProperty({ example: 'LHR' })
  @Matches(/^[A-Z]{3}$/)
  arrivalAirport: string;
  @ApiProperty({
    description: 'Airport-local ISO date-time, or explicit UTC/offset instant',
  })
  @IsDateString({ strict: true })
  departureAt: string;
  @ApiProperty() @IsDateString({ strict: true }) arrivalAt: string;
  @ApiProperty({ type: [CabinDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((c: CabinDto) => c.cabinClass)
  @ValidateNested({ each: true })
  @Type(() => CabinDto)
  cabins: CabinDto[];
}
export class UpdateFlightDto {
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @Matches(/^[A-Z]{3}$/)
  departureAirport?: string;
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @Matches(/^[A-Z]{3}$/)
  arrivalAirport?: string;
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsDateString({ strict: true })
  departureAt?: string;
  @ApiPropertyOptional()
  @ValidateIf((_o, v) => v !== undefined)
  @IsDateString({ strict: true })
  arrivalAt?: string;
}
export class SearchFlightsDto {
  @ApiProperty() @Matches(/^[A-Z]{3}$/) departureAirport: string;
  @ApiProperty() @Matches(/^[A-Z]{3}$/) arrivalAirport: string;
  @ApiProperty({ example: '2026-12-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  departureDate: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  returnDate?: string;
  @ApiPropertyOptional({ enum: ['one-way', 'round-trip'] })
  @IsIn(['one-way', 'round-trip'])
  tripType = 'one-way';
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(1) adults = 1;
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(0) children = 0;
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(0) infants = 0;
  @ApiPropertyOptional({ enum: CABINS })
  @IsOptional()
  @IsIn(CABINS)
  cabinClass?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPriceMinor?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPriceMinor?: number;
  @ApiPropertyOptional({ description: 'Required with price filtering/sorting' })
  @IsOptional()
  @IsISO4217CurrencyCode()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
  @ApiPropertyOptional({
    enum: ['departure', 'duration', 'price-asc', 'price-desc'],
  })
  @IsIn(['departure', 'duration', 'price-asc', 'price-desc'])
  sort = 'departure';
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit =
    20;
}
export class LegDto {
  @ApiProperty() @IsMongoId() flightId: string;
  @ApiProperty({ enum: CABINS }) @IsIn(CABINS) cabinClass: string;
}
export class HoldDto {
  @ApiProperty({ type: [LegDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ArrayUnique((l: LegDto) => l.flightId)
  @ValidateNested({ each: true })
  @Type(() => LegDto)
  legs: LegDto[];
  @ApiProperty() @IsInt() @Min(1) seats: number;
}
export class PassengerDto {
  @ApiProperty() @IsString() @Matches(/\S/) name: string;
  @ApiProperty({ enum: ['adult', 'child', 'infant'] })
  @IsIn(['adult', 'child', 'infant'])
  type: string;
  @ApiProperty({ example: '2000-01-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dateOfBirth: string;
  @ApiProperty() @IsString() @Matches(/\S/) documentNumber: string;
  @ApiPropertyOptional({
    description: 'One weight in kg for each extra bag on every segment',
  })
  @IsArray()
  @IsNumber({}, { each: true })
  @IsPositive({ each: true })
  extraBagWeightsKg?: number[] = [];
}
export class CreateBookingDto {
  @ApiProperty() @IsMongoId() holdId: string;
  @ApiProperty({ type: [PassengerDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PassengerDto)
  passengers: PassengerDto[];
  @ApiProperty() @IsEmail() contactEmail: string;
  @ApiProperty({
    description: 'Explicit acceptance of quoted airline policies',
  })
  @Equals(true)
  acceptedPolicies: boolean;
}
export class PageDto {
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit =
    20;
}
export class BookingQueryDto extends PageDto {
  @ApiPropertyOptional({ enum: ['upcoming', 'past', 'cancelled'] })
  @IsOptional()
  @IsIn(['upcoming', 'past', 'cancelled'])
  group?: string;
}
export class ConfirmCancellationDto {
  @ApiProperty() @Equals(true) confirmed: boolean;
}
export class AirportQueryDto extends PageDto {
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{3}$/) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/\S/) city?: string;
}
