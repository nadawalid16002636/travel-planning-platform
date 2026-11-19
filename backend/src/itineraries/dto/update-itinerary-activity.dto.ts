import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsString,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateItineraryActivityCostDto } from './create-itinerary-activity.dto.js';

export class UpdateItineraryActivityDto {
  @ApiPropertyOptional({ example: 'Visit the museum', description: 'Activity name.' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  title?: string;

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
