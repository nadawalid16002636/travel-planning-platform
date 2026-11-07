import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.dto.js';

/** GEN-05: every reference list is paginated (page size 10). */
export class SearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Case-insensitive name search' })
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}

export class CitiesQueryDto extends SearchQueryDto {
  @ApiPropertyOptional({ example: 'EG', description: 'Country code' })
  @IsOptional() @IsString() @Length(2, 3) country?: string;
}

export class AirportsQueryDto extends CitiesQueryDto {
  @ApiPropertyOptional({ example: 'cairo', description: 'city_id' })
  @IsOptional() @IsString() @MaxLength(100) city?: string;
}

export class AttractionsQueryDto extends SearchQueryDto {
  @ApiPropertyOptional({ example: 'cairo', description: 'city_id' })
  @IsOptional() @IsString() @MaxLength(100) city?: string;
}
