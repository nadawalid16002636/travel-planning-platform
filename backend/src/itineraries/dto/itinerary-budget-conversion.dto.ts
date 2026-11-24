import { ApiProperty } from '@nestjs/swagger';
import type { ItineraryBudgetSummaryCategory } from './itinerary-budget-summary.dto.js';

export const BUDGET_CONVERSION_UNAVAILABLE_REASONS = [
  'preferred_currency_missing',
  'preferred_currency_unsupported',
  'source_currency_unsupported',
  'rates_unavailable',
  'source_rate_missing',
  'target_rate_missing',
  'invalid_rate_snapshot',
  'currency_precision_unavailable',
] as const;

export type BudgetConversionUnavailableReason =
  (typeof BUDGET_CONVERSION_UNAVAILABLE_REASONS)[number];

export class ConvertedBudgetAmountDto {
  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ minimum: 0, example: 42.35 })
  amount: number;
}

export class ConvertedBudgetCategoryTotalDto {
  @ApiProperty({ enum: ['food', 'accommodation', 'local_transportation', 'activities', 'intercity_transportation'] })
  category: ItineraryBudgetSummaryCategory;

  @ApiProperty({ minimum: 0, example: 42.35 })
  amount: number;
}

export class ConvertedBudgetDayTotalDto {
  @ApiProperty({ minimum: 1 })
  dayOrder: number;

  @ApiProperty({ type: String, format: 'date', example: '2026-04-10' })
  date: string;

  @ApiProperty({ minimum: 0, example: 42.35 })
  amount: number;
}

export class ConvertedBudgetCityGroupTotalDto {
  @ApiProperty({ type: String, nullable: true, example: 'cairo' })
  cityId: string | null;

  @ApiProperty({ minimum: 1 })
  startDayOrder: number;

  @ApiProperty({ minimum: 1 })
  endDayOrder: number;

  @ApiProperty({ minimum: 1 })
  dayCount: number;

  @ApiProperty({ minimum: 0, example: 42.35 })
  amount: number;
}

export class ItineraryBudgetConversionAvailableDto {
  @ApiProperty({ enum: ['available'] })
  status: 'available';

  @ApiProperty({ example: 'USD' })
  targetCurrency: string;

  @ApiProperty({ type: String, format: 'date', example: '2026-11-13' })
  rateDate: string;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-11-13T02:00:15.000Z' })
  fetchedAt: Date;

  @ApiProperty({ enum: ['cached'], description: 'The conversion uses the currently cached FX snapshot.' })
  rateSource: 'cached';

  @ApiProperty({ type: ConvertedBudgetAmountDto })
  total: ConvertedBudgetAmountDto;

  @ApiProperty({ type: [ConvertedBudgetCategoryTotalDto] })
  categoryTotals: ConvertedBudgetCategoryTotalDto[];

  @ApiProperty({ type: [ConvertedBudgetDayTotalDto] })
  dayTotals: ConvertedBudgetDayTotalDto[];

  @ApiProperty({ type: [ConvertedBudgetCityGroupTotalDto] })
  cityGroupTotals: ConvertedBudgetCityGroupTotalDto[];
}

export class ItineraryBudgetConversionUnavailableDto {
  @ApiProperty({ enum: ['unavailable'] })
  status: 'unavailable';

  @ApiProperty({ required: false, example: 'EUR' })
  targetCurrency?: string;

  @ApiProperty({ enum: BUDGET_CONVERSION_UNAVAILABLE_REASONS })
  reason: BudgetConversionUnavailableReason;
}

export type ItineraryBudgetConversionDto =
  | ItineraryBudgetConversionAvailableDto
  | ItineraryBudgetConversionUnavailableDto;
