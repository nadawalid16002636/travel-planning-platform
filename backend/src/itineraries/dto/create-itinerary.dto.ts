
import {
  IsString,
  IsNotEmpty,
  Matches,
  IsOptional,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsEnum,
  IsDateString,
  IsNumber,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class CreateActivityCostDto {
  @ApiProperty({ minimum: 0, example: 25 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({
    example: 'EGP',
    minLength: 3,
    maxLength: 3,
    description: 'Must be a supported seeded currency code.',
  })
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency: string;
}

class CreateActivityDto {
  @ApiProperty({ example: 'Visit the museum' })
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

  @ApiPropertyOptional({ type: CreateActivityCostDto })
  @ValidateNested()
  @Type(() => CreateActivityCostDto)
  @IsOptional()
  cost?: CreateActivityCostDto;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];
}

class CreateDayDto {
  @ApiProperty({ example: 'cairo' })
  @IsString()
  @IsNotEmpty()
  cityId: string;

  @ApiPropertyOptional({ example: 'Arrive in the morning' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ type: [CreateActivityDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateActivityDto)
  @IsOptional()
  activities?: CreateActivityDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];
}

class CreateBudgetEntryDto {
  @ApiProperty({ enum: ['food', 'accommodation', 'local_transportation', 'activities', 'intercity_transportation'] })
  @IsEnum([
    'food',
    'accommodation',
    'local_transportation',
    'activities',
    'intercity_transportation',
  ])
  category: string;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ example: 'EGP' })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsDateString()
  @IsOptional()
  date?: string;
}

export class CreateItineraryDto {
  @ApiProperty({ maxLength: 100, example: 'Cairo weekend' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ type: [String], minItems: 1, example: ['EG'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Matches(/^[A-Za-z]{2}$/, { each: true })
  countryCodes: string[];

  @ApiProperty({ type: String, format: 'date', example: '2026-11-11' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate: string;

  @ApiPropertyOptional({ enum: ['private', 'public'], default: 'private' })
  @IsEnum(['private', 'public'])
  @IsOptional()
  visibility?: string;

  @ApiPropertyOptional({
    type: [CreateDayDto],
    maxItems: 60,
    description:
      'Array position determines sequential day order. The backend derives each day date from startDate at UTC midnight; do not send day dates or order values.',
  })
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => CreateDayDto)
  @IsOptional()
  days?: CreateDayDto[];

  @ApiPropertyOptional({ type: [CreateBudgetEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBudgetEntryDto)
  @IsOptional()
  budgetEntries?: CreateBudgetEntryDto[];
}
