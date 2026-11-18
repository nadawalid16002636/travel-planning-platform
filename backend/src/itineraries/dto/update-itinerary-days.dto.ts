
import {
  IsArray,
  IsInt,
  IsPositive,
  IsString,
  IsNotEmpty,
  ValidateNested,
  IsOptional,
  IsNumber,
  Min,
  Matches,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class UpdateActivityCostDto {
  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ example: 'EGP' })
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency: string;
}

class UpdateActivityDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ example: '09:00' })
  @IsString()
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional({ example: '11:00' })
  @IsString()
  @IsOptional()
  endTime?: string;

  @ApiPropertyOptional({ type: UpdateActivityCostDto })
  @ValidateNested()
  @Type(() => UpdateActivityCostDto)
  @IsOptional()
  cost?: UpdateActivityCostDto;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];
}

class UpdateDayDto {
  @ApiProperty({ minimum: 1, example: 1 })
  @IsInt()
  @IsPositive()
  order: number;

  @ApiProperty({ example: 'cairo' })
  @IsString()
  @IsNotEmpty()
  cityId: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ type: [UpdateActivityDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateActivityDto)
  @IsOptional()
  activities?: UpdateActivityDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];
}

export class UpdateItineraryDaysDto {
  @ApiProperty({ type: [UpdateDayDto], maxItems: 60 })
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => UpdateDayDto)
  days: UpdateDayDto[];
}
