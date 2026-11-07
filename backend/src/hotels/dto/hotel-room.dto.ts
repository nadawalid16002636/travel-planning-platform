import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateHotelRoomDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @ApiProperty({ maxLength: 100 })
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @ApiProperty({ maxLength: 60, example: 'Deluxe double' })
  type: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @ApiProperty({ minimum: 1, maximum: 20 })
  bedCount: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @ApiProperty({ minimum: 1, maximum: 20 })
  maxOccupancy: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({
    minimum: 1,
    description: 'Price in the currency smallest unit per night.',
  })
  pricePerNight: number;

  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  @ApiProperty({ minLength: 3, maxLength: 3, example: 'USD' })
  currency: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @ApiPropertyOptional({ type: [String], maxItems: 30 })
  amenities?: string[];
}

export class UpdateHotelRoomDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @ApiPropertyOptional({ maxLength: 100 })
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @ApiPropertyOptional({ maxLength: 60 })
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @ApiPropertyOptional({ minimum: 1, maximum: 20 })
  bedCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @ApiPropertyOptional({ minimum: 1, maximum: 20 })
  maxOccupancy?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    minimum: 1,
    description: 'Price in the currency smallest unit per night.',
  })
  pricePerNight?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  @ApiPropertyOptional({ minLength: 3, maxLength: 3, example: 'USD' })
  currency?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @ApiPropertyOptional({ type: [String], maxItems: 30 })
  amenities?: string[];

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional()
  isActive?: boolean;
}

export class UpdateRoomAvailabilityDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(90)
  @ValidateNested({ each: true })
  @Type(() => RoomAvailabilityRangeDto)
  @ApiPropertyOptional({ type: () => [RoomAvailabilityRangeDto] })
  availabilityRanges?: RoomAvailabilityRangeDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(90)
  @ArrayUnique()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true })
  @ApiPropertyOptional({ type: [String], format: 'date', maxItems: 90 })
  blockedDates?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(90)
  @ArrayUnique()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true })
  @ApiPropertyOptional({ type: [String], format: 'date', maxItems: 90 })
  unblockedDates?: string[];
}

export class RoomAvailabilityRangeDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @ApiProperty({ format: 'date' })
  startDate: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @ApiProperty({ format: 'date', description: 'Exclusive checkout boundary.' })
  endDate: string;
}

export class HotelCancellationTierDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @ApiProperty({ minimum: 0 })
  daysBeforeCheckIn: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  @ApiProperty({ minimum: 0, maximum: 100 })
  refundPercent: number;
}

export class UpdateHotelPolicyDto {
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @ApiProperty({ example: '15:00' })
  checkInTime: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @ApiProperty({ example: '11:00' })
  checkOutTime: string;

  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique(
    (tier: HotelCancellationTierDto) => tier.daysBeforeCheckIn,
    { message: 'Cancellation tier day thresholds must be unique' },
  )
  @ValidateNested({ each: true })
  @Type(() => HotelCancellationTierDto)
  @ApiProperty({ type: () => [HotelCancellationTierDto] })
  cancellationTiers: HotelCancellationTierDto[];
}

export class RoomAvailabilityQueryDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @ApiProperty({ format: 'date' })
  checkIn: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @ApiProperty({ format: 'date', description: 'Exclusive checkout boundary.' })
  checkOut: string;
}
