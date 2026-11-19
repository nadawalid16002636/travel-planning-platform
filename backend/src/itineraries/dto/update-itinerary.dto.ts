import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  IsIn,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateItineraryDto {
  @ApiPropertyOptional({ enum: ['private', 'public'] })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['private', 'public'])
  visibility?: string;

  @ApiPropertyOptional({ maxLength: 100, example: 'Cairo weekend' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ example: 'A short visit to Cairo' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String], minItems: 1, example: ['EG'] })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Matches(/^[A-Za-z]{2}$/, { each: true })
  countryCodes?: string[];

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2026-11-11',
    description: 'Date-only value; existing day dates are recalculated at UTC midnight.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;
}
