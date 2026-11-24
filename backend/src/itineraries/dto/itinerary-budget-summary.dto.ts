import { ApiProperty, getSchemaPath } from '@nestjs/swagger';
import {
  ItineraryBudgetConversionAvailableDto,
  ItineraryBudgetConversionUnavailableDto,
} from './itinerary-budget-conversion.dto.js';
import type { ItineraryBudgetConversionDto } from './itinerary-budget-conversion.dto.js';
import { ItineraryLinkedBookingDto } from './itinerary-booking.dto.js';

export const ITINERARY_BUDGET_SUMMARY_CATEGORIES = [
  'food',
  'accommodation',
  'local_transportation',
  'activities',
  'intercity_transportation',
] as const;

export type ItineraryBudgetSummaryCategory =
  (typeof ITINERARY_BUDGET_SUMMARY_CATEGORIES)[number];

export class BudgetCurrencyAmountDto {
  @ApiProperty({ example: 'EGP' })
  currency: string;

  @ApiProperty({ minimum: 0, example: 125.5 })
  amount: number;
}

export class BudgetCategoryTotalDto {
  @ApiProperty({ enum: ITINERARY_BUDGET_SUMMARY_CATEGORIES })
  category: ItineraryBudgetSummaryCategory;

  @ApiProperty({ type: [BudgetCurrencyAmountDto] })
  totalsByCurrency: BudgetCurrencyAmountDto[];
}

export class BudgetDayTotalDto {
  @ApiProperty({ minimum: 1 })
  dayOrder: number;

  @ApiProperty({ type: String, format: 'date', example: '2026-04-10' })
  date: string;

  @ApiProperty({ type: String, nullable: true, example: 'cairo' })
  cityId: string | null;

  @ApiProperty({ type: [BudgetCurrencyAmountDto] })
  totalsByCurrency: BudgetCurrencyAmountDto[];

  @ApiProperty({ type: [BudgetCategoryTotalDto] })
  categoryTotals: BudgetCategoryTotalDto[];

  @ApiProperty({ type: [ItineraryLinkedBookingDto], description: 'Linked confirmed flight bookings; their total is included once in intercity_transportation when the departure date matches this day.' })
  linkedBookings: ItineraryLinkedBookingDto[];
}

export class BudgetCityGroupDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'cairo',
    description: 'Canonical city ID. Null is a standalone group for a legacy day without a canonical city ID.',
  })
  cityId: string | null;

  @ApiProperty({ minimum: 1 })
  startDayOrder: number;

  @ApiProperty({ minimum: 1 })
  endDayOrder: number;

  @ApiProperty({ minimum: 1 })
  dayCount: number;

  @ApiProperty({
    type: [BudgetCurrencyAmountDto],
    description: 'Subtotal for this consecutive city group, kept separate by currency.',
  })
  totalsByCurrency: BudgetCurrencyAmountDto[];
}

export class UnassignedLegacyBudgetEntryDto {
  @ApiProperty({ enum: ITINERARY_BUDGET_SUMMARY_CATEGORIES })
  category: ItineraryBudgetSummaryCategory;

  @ApiProperty({ minimum: 0 })
  amount: number;

  @ApiProperty({ example: 'EGP' })
  currency: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ required: false, type: String, format: 'date', example: '2026-04-10' })
  date?: string;
}

export class UnassignedLegacyCurrencyTotalDto {
  @ApiProperty({ example: 'EGP' })
  currency: string;

  @ApiProperty({ minimum: 0 })
  amount: number;

  @ApiProperty({ type: [UnassignedLegacyBudgetEntryDto] })
  entries: UnassignedLegacyBudgetEntryDto[];
}

export class ItineraryBudgetSummaryDto {
  @ApiProperty({ example: '64b000000000000000000002' })
  itineraryId: string;

  @ApiProperty({
    type: [BudgetCurrencyAmountDto],
    description: 'Amounts are grouped by currency; values in different currencies are never added together.',
  })
  totalsByCurrency: BudgetCurrencyAmountDto[];

  @ApiProperty({ type: [BudgetCategoryTotalDto] })
  categoryTotals: BudgetCategoryTotalDto[];

  @ApiProperty({ type: [BudgetDayTotalDto] })
  dayTotals: BudgetDayTotalDto[];

  @ApiProperty({
    type: [BudgetCityGroupDto],
    description: 'Derived from the current ordered days. Only adjacent days with the same canonical city ID are grouped; days without one each form a standalone null-city group.',
  })
  cityGroups: BudgetCityGroupDto[];

  @ApiProperty({
    type: [UnassignedLegacyCurrencyTotalDto],
    description: 'A detail breakdown of unmatched legacy spending already included in totalsByCurrency and categoryTotals.',
  })
  unassignedLegacyByCurrency: UnassignedLegacyCurrencyTotalDto[];

  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(ItineraryBudgetConversionAvailableDto) },
      { $ref: getSchemaPath(ItineraryBudgetConversionUnavailableDto) },
    ],
    description: 'Converted totals in the current user’s supported preferred currency, or a typed unavailable result with no partial converted amounts.',
  })
  conversion: ItineraryBudgetConversionDto;
}

/** Raw summary shape produced before the request-specific conversion is attached. */
export type RawItineraryBudgetSummaryDto = Omit<ItineraryBudgetSummaryDto, 'conversion'>;
