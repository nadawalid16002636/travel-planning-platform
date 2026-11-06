import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateHotelDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @ApiProperty()
  name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @ApiProperty()
  city: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @ApiProperty()
  country: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @ApiProperty()
  address: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  starRating?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiPropertyOptional({ type: [String] })
  amenities?: string[];
}
