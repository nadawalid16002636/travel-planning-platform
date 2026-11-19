import type { FxCachedSnapshot } from '../fx/fx.service.js';
import type { RawItineraryBudgetSummaryDto } from './dto/itinerary-budget-summary.dto.js';
import {
  ItineraryBudgetConversionAvailableDto,
  ItineraryBudgetConversionDto,
  BudgetConversionUnavailableReason,
} from './dto/itinerary-budget-conversion.dto.js';

type CurrencyAmount = { currency: string; amount: number };
type ConversionAmountResult =
  | { ok: true; amount: number }
  | { ok: false; reason: BudgetConversionUnavailableReason };

function currencyPrecision(currency: string): number | undefined {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits;
  } catch {
    return undefined;
  }
}

function roundAtOutputBoundary(
  amount: number,
  fractionDigits: number,
): number {
  const factor = 10 ** fractionDigits;
  // Scale the epsilon to the magnitude to correct binary representation of
  // decimal half-units (for example, 61.725 may be represented just below it).
  const correction = Number.EPSILON * Math.max(1, Math.abs(amount));
  return Math.round((amount + correction) * factor) / factor;
}

function convertBuckets(
  buckets: CurrencyAmount[],
  targetRate: number,
  rates: Record<string, number>,
  fractionDigits: number,
): ConversionAmountResult {
  let converted = 0;
  for (const bucket of buckets) {
    if (
      typeof bucket.currency !== 'string' ||
      typeof bucket.amount !== 'number' ||
      !Number.isFinite(bucket.amount) ||
      bucket.amount < 0
    ) {
      return { ok: false, reason: 'invalid_rate_snapshot' };
    }

    const sourceCurrency = bucket.currency.trim().toUpperCase();
    const sourceRate = sourceCurrency === 'USD' ? 1 : rates[sourceCurrency];
    if (sourceRate === undefined) {
      return { ok: false, reason: 'source_rate_missing' };
    }
    if (!Number.isFinite(sourceRate) || sourceRate <= 0) {
      return { ok: false, reason: 'invalid_rate_snapshot' };
    }

    converted += (bucket.amount / sourceRate) * targetRate;
    if (!Number.isFinite(converted)) {
      return { ok: false, reason: 'invalid_rate_snapshot' };
    }
  }

  const roundedAmount = roundAtOutputBoundary(converted, fractionDigits);
  if (!Number.isFinite(roundedAmount)) {
    return { ok: false, reason: 'invalid_rate_snapshot' };
  }
  return { ok: true, amount: roundedAmount };
}

function unavailable(
  targetCurrency: string,
  reason: BudgetConversionUnavailableReason,
): ItineraryBudgetConversionDto {
  return {
    status: 'unavailable',
    targetCurrency,
    reason,
  };
}

/** Pure conversion of the already calculated raw summary; it never reads or mutates itinerary data. */
export function convertItineraryBudgetSummary(
  summary: RawItineraryBudgetSummaryDto,
  rawTargetCurrency: string,
  snapshot: FxCachedSnapshot,
): ItineraryBudgetConversionDto {
  const targetCurrency = rawTargetCurrency.trim().toUpperCase();
  const targetRate = targetCurrency === 'USD' ? 1 : snapshot.rates[targetCurrency];
  if (targetRate === undefined) {
    return unavailable(targetCurrency, 'target_rate_missing');
  }
  if (!Number.isFinite(targetRate) || targetRate <= 0) {
    return unavailable(targetCurrency, 'invalid_rate_snapshot');
  }

  const fractionDigits = currencyPrecision(targetCurrency);
  if (fractionDigits === undefined) {
    return unavailable(targetCurrency, 'currency_precision_unavailable');
  }

  const convert = (buckets: CurrencyAmount[]) =>
    convertBuckets(buckets, targetRate, snapshot.rates, fractionDigits);
  const total = convert(summary.totalsByCurrency);
  if (!total.ok) return unavailable(targetCurrency, total.reason);

  const categoryTotals: ItineraryBudgetConversionAvailableDto['categoryTotals'] = [];
  for (const category of summary.categoryTotals) {
    const converted = convert(category.totalsByCurrency);
    if (!converted.ok) return unavailable(targetCurrency, converted.reason);
    categoryTotals.push({ category: category.category, amount: converted.amount });
  }

  const dayTotals: ItineraryBudgetConversionAvailableDto['dayTotals'] = [];
  for (const day of summary.dayTotals) {
    const converted = convert(day.totalsByCurrency);
    if (!converted.ok) return unavailable(targetCurrency, converted.reason);
    dayTotals.push({ dayOrder: day.dayOrder, date: day.date, amount: converted.amount });
  }

  const cityGroupTotals: ItineraryBudgetConversionAvailableDto['cityGroupTotals'] = [];
  for (const group of summary.cityGroups) {
    const converted = convert(group.totalsByCurrency);
    if (!converted.ok) return unavailable(targetCurrency, converted.reason);
    cityGroupTotals.push({
      cityId: group.cityId,
      startDayOrder: group.startDayOrder,
      endDayOrder: group.endDayOrder,
      dayCount: group.dayCount,
      amount: converted.amount,
    });
  }

  return {
    status: 'available',
    targetCurrency,
    rateDate: snapshot.rateDate,
    fetchedAt: new Date(snapshot.fetchedAt),
    rateSource: 'cached',
    total: { currency: targetCurrency, amount: total.amount },
    categoryTotals,
    dayTotals,
    cityGroupTotals,
  };
}
