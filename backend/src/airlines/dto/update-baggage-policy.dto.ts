import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsISO4217CurrencyCode,
  Min,
  Matches,
  Max,
} from 'class-validator';
export class UpdateBaggagePolicyDto {
  @ApiProperty() @IsInt() @Min(0) checkedBaggageKg: number;
  @ApiProperty() @IsInt() @Min(0) cabinBaggageKg: number;
  @ApiProperty({
    description: 'FLT-08: price per extra bag in currency minor units',
  })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  extraBagPriceMinor: number;
  @ApiProperty() @IsInt() @Min(0) maxExtraBagsPerPassenger: number;
  @ApiProperty({ example: 'USD' })
  @IsISO4217CurrencyCode()
  @Matches(/^[A-Z]{3}$/)
  currency: string;
}
