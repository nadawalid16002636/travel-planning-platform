import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsString,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateItineraryActivityCostDto {
  @ApiProperty({ minimum: 0, example: 25 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ example: 'EGP', minLength: 3, maxLength: 3, description: 'A supported seeded currency code.' })
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency: string;
}

export class CreateItineraryActivityDto {
  @ApiProperty({ example: 'Visit the museum', description: 'Activity name.' })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  title: string;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: '09:00' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({ example: '11:00' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({ type: CreateItineraryActivityCostDto })
  @ValidateIf((_object, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => CreateItineraryActivityCostDto)
  cost?: CreateItineraryActivityCostDto;
}
