import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.dto.js';

/** GEN-05 itinerary list pagination: fixed maximum page size of 10. */
export class ItinerariesPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit = 10;
}
