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

export class CreateHotelDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  city: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  country: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  address: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  starRating?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];
}
