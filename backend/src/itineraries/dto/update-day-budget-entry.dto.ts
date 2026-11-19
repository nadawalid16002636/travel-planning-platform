import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsString, Matches, Min, ValidateIf } from 'class-validator';
import { DayBudgetCategory } from '../schemas/day-budget-entry.schema.js';

export class UpdateDayBudgetEntryDto {
  @ApiPropertyOptional({ enum: Object.values(DayBudgetCategory) })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(DayBudgetCategory)
  category?: DayBudgetCategory;

  @ApiPropertyOptional({ minimum: 0 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ example: 'EGP', minLength: 3, maxLength: 3 })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  description?: string;
}
