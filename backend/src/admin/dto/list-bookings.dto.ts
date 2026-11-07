import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.dto.js';

export const BOOKING_STATUSES = [
  'pending_payment',
  'confirmed',
  'completed',
  'cancelled',
  'expired',
  'payment_failed',
  'cancellation_pending',
] as const;
export type BookingStatusFilter = (typeof BOOKING_STATUSES)[number];

/** ACC-17: filter by type, status and travel-date range. */
export class ListBookingsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['flight', 'hotel'], description: 'Omit for both' })
  @IsOptional() @IsIn(['flight', 'hotel']) type?: 'flight' | 'hotel';

  @ApiPropertyOptional({ enum: BOOKING_STATUSES })
  @IsOptional() @IsIn(BOOKING_STATUSES) status?: BookingStatusFilter;

  @ApiPropertyOptional({ example: '2026-12-01', description: 'Travel start date from (departure / check-in)' })
  @IsOptional() @IsDateString() from?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Travel start date to (inclusive)' })
  @IsOptional() @IsDateString() to?: string;
}
