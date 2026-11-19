import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, Matches, Min, Validate } from 'class-validator';
import { DistinctCityPairValidator } from './validators/distinct-city-pair.validator.js';

export class CreateIntercityTransportEntryDto {
  @ApiProperty({ description: 'Transport mode; ITN-16 does not prescribe an enum.' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  mode: string;

  @ApiProperty({ example: 'cairo' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  fromCityId: string;

  @ApiProperty({ example: 'alexandria' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @Validate(DistinctCityPairValidator)
  toCityId: string;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ example: 'EGP', minLength: 3, maxLength: 3 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency: string;
}
