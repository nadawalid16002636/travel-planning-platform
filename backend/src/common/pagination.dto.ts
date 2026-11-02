import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Extend this in your query DTOs. Return Paginated<T> from list endpoints. */
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit = 10; // GEN-05: page size 10
}

export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

export function paginate<T>(data: T[], total: number, q: PaginationQueryDto): Paginated<T> {
  return { data, page: q.page, limit: q.limit, total };
}
