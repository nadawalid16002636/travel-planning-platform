import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, Matches, Min, Validate, ValidateIf } from 'class-validator';
import { DistinctCityPairValidator } from './validators/distinct-city-pair.validator.js';

export class UpdateIntercityTransportEntryDto {
  @ApiPropertyOptional({ description: 'Transport mode; ITN-16 does not prescribe an enum.' })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  mode?: string;

  @ApiPropertyOptional({ example: 'cairo' })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  fromCityId?: string;

  @ApiPropertyOptional({ example: 'alexandria' })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @Validate(DistinctCityPairValidator)
  toCityId?: string;

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
}
