import type { FxCachedSnapshot } from '../fx/fx.service.js';
import type { RawItineraryBudgetSummaryDto } from './dto/itinerary-budget-summary.dto.js';
import { ITINERARY_BUDGET_SUMMARY_CATEGORIES } from './dto/itinerary-budget-summary.dto.js';
import { convertItineraryBudgetSummary } from './itinerary-budget-conversion.js';

const makeSummary = (
  overrides: Partial<RawItineraryBudgetSummaryDto> = {},
): RawItineraryBudgetSummaryDto => ({
  itineraryId: 'itinerary-1',
  totalsByCurrency: [],
  categoryTotals: ITINERARY_BUDGET_SUMMARY_CATEGORIES.map((category) => ({
    category,
    totalsByCurrency: [],
  })),
  dayTotals: [],
  cityGroups: [],
  unassignedLegacyByCurrency: [],
  ...overrides,
});

const makeSnapshot = (
  rates: Record<string, number>,
): FxCachedSnapshot => ({
  provider: 'FXRatesAPI',
  baseCurrency: 'USD',
  rateDate: '2026-11-13',
  fetchedAt: new Date('2026-11-13T02:00:00.000Z'),
  rates,
});

describe('convertItineraryBudgetSummary', () => {
  it('uses USD identity and converts multiple source currencies with USD-base rates', () => {
    const result = convertItineraryBudgetSummary(
      makeSummary({
        totalsByCurrency: [
          { currency: 'USD', amount: 10 },
          { currency: 'EGP', amount: 80 },
          { currency: 'EUR', amount: 8 },
        ],
      }),
      'EUR',
      makeSnapshot({ USD: 1, EGP: 40, EUR: 0.8 }),
    );

    expect(result).toMatchObject({
      status: 'available',
      targetCurrency: 'EUR',
      total: { currency: 'EUR', amount: 17.6 },
      rateSource: 'cached',
    });
  });

  it.each([
    ['USD', 1.2345, 1.23],
    ['EUR', 1.2345, 0.99],
    ['EGP', 1.2345, 61.73],
    ['JPY', 1.237, 186],
    ['KWD', 1.23456, 0.37],
  ])('rounds %s according to currency minor-unit metadata', (currency, amount, expected) => {
    const result = convertItineraryBudgetSummary(
      makeSummary({ totalsByCurrency: [{ currency: 'USD', amount }] }),
      currency,
      makeSnapshot({ USD: 1, EUR: 0.8, EGP: 50, JPY: 150, KWD: 0.3 }),
    );

    expect(result).toMatchObject({
      status: 'available',
      targetCurrency: currency,
      total: { amount: expected },
    });
  });

  it('aggregates converted currency buckets before rounding', () => {
    const result = convertItineraryBudgetSummary(
      makeSummary({
        totalsByCurrency: [
          { currency: 'USD', amount: 0.004 },
          { currency: 'EUR', amount: 0.004 },
          { currency: 'EGP', amount: 0.004 },
        ],
      }),
      'USD',
      makeSnapshot({ USD: 1, EUR: 1, EGP: 1 }),
    );

    expect(result).toMatchObject({ status: 'available', total: { amount: 0.01 } });
  });

  it('returns unavailable without partial totals when a source rate is missing', () => {
    const result = convertItineraryBudgetSummary(
      makeSummary({ totalsByCurrency: [{ currency: 'GBP', amount: 10 }] }),
      'USD',
      makeSnapshot({ USD: 1 }),
    );

    expect(result).toEqual({
      status: 'unavailable', targetCurrency: 'USD', reason: 'source_rate_missing',
    });
    expect(result).not.toHaveProperty('total');
  });

  it('returns unavailable without partial totals when the target rate is missing', () => {
    const result = convertItineraryBudgetSummary(
      makeSummary({ totalsByCurrency: [{ currency: 'USD', amount: 10 }] }),
      'EUR',
      makeSnapshot({ USD: 1 }),
    );

    expect(result).toEqual({
      status: 'unavailable', targetCurrency: 'EUR', reason: 'target_rate_missing',
    });
  });

  it('rounds only output totals and does not mutate the raw summary or snapshot', () => {
    const summary = makeSummary({
      totalsByCurrency: [{ currency: 'USD', amount: 1.2345 }],
      categoryTotals: ITINERARY_BUDGET_SUMMARY_CATEGORIES.map((category, index) => ({
        category,
        totalsByCurrency: index === 0 ? [{ currency: 'USD', amount: 1.2345 }] : [],
      })),
      dayTotals: [{
        dayOrder: 1, date: '2026-04-10', cityId: 'cairo',
        totalsByCurrency: [{ currency: 'USD', amount: 1.2345 }], categoryTotals: [],
      }],
      cityGroups: [{
        cityId: 'cairo', startDayOrder: 1, endDayOrder: 1, dayCount: 1,
        totalsByCurrency: [{ currency: 'USD', amount: 1.2345 }],
      }],
    });
    const snapshot = makeSnapshot({ USD: 1, EUR: 0.8 });
    const originalSummary = JSON.stringify(summary);
    const originalSnapshot = JSON.stringify(snapshot);

    const result = convertItineraryBudgetSummary(summary, 'EUR', snapshot);

    expect(result).toMatchObject({
      status: 'available',
      total: { amount: 0.99 },
      dayTotals: [{ dayOrder: 1, amount: 0.99 }],
      cityGroupTotals: [{ cityId: 'cairo', amount: 0.99 }],
    });
    if (result.status !== 'available') throw new Error('expected available');
    expect(result.categoryTotals[0]).toEqual({ category: 'food', amount: 0.99 });
    expect(JSON.stringify(summary)).toBe(originalSummary);
    expect(JSON.stringify(snapshot)).toBe(originalSnapshot);
  });
});
