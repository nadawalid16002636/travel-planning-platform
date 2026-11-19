import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsString, Matches, Min, ValidateIf } from 'class-validator';
import { DayBudgetCategory } from '../schemas/day-budget-entry.schema.js';

export class CreateDayBudgetEntryDto {
  @ApiProperty({ enum: Object.values(DayBudgetCategory) })
  @IsEnum(DayBudgetCategory)
  category: DayBudgetCategory;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({
    example: 'EGP',
    minLength: 3,
    maxLength: 3,
    description: 'Three-letter currency code; supported-currency lookup occurs in the service.',
  })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency: string;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  description?: string;
}
