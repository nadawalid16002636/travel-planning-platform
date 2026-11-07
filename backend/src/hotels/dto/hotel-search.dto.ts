import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.dto.js';

export class HotelSearchDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  city?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  country?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  amenity?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  minRating?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @ApiPropertyOptional({ format: 'date' })
  checkIn?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @ApiPropertyOptional({ format: 'date' })
  checkOut?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 20 })
  guests = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 10 })
  rooms = 1;

  @IsOptional()
  @IsIn(['name', 'rating', 'price'])
  @ApiPropertyOptional({ enum: ['name', 'rating', 'price'], default: 'name' })
  sortBy: 'name' | 'rating' | 'price' = 'name';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  sortOrder: 'asc' | 'desc' = 'asc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ minimum: 1, description: 'Requires currency.' })
  minPricePerNight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ minimum: 1, description: 'Requires currency.' })
  maxPricePerNight?: number;

  @ValidateIf(
    (query: HotelSearchDto) =>
      query.minPricePerNight !== undefined ||
      query.maxPricePerNight !== undefined ||
      query.sortBy === 'price' ||
      query.currency !== undefined,
  )
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  @ApiPropertyOptional({
    minLength: 3,
    maxLength: 3,
    description: 'Required to filter or sort by price.',
  })
  currency?: string;
}
