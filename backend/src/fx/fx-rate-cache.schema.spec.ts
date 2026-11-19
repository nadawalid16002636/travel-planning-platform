import { Mongoose } from 'mongoose';
import { FxRateCache, FxRateCacheSchema } from './fx-rate-cache.schema.js';

describe('FxRateCacheSchema validation', () => {
  // Compile an isolated model for in-memory document validation only. No
  // connection is opened and no model operation reaches MongoDB.
  const isolatedMongoose = new Mongoose();
  const FxRateCacheModel = isolatedMongoose.model<FxRateCache & { _id: string }>(
    'FxRateCacheValidationFixture',
    FxRateCacheSchema,
  );

  const makeDocument = (overrides: Record<string, unknown> = {}) =>
    new FxRateCacheModel({
      provider: 'FXRatesAPI',
      baseCurrency: 'USD',
      rateDate: '2026-02-28',
      fetchedAt: new Date('2026-03-01T00:00:00.000Z'),
      rates: { USD: 1, EUR: 0.92 },
      ...overrides,
    });

  const expectInvalid = async (overrides: Record<string, unknown>, path: string) => {
    let error: any;
    try {
      await makeDocument(overrides).validate();
    } catch (validationError) {
      error = validationError;
    }

    expect(error).toBeDefined();
    expect(
      Object.keys(error.errors).some((errorPath) =>
        errorPath === path || errorPath.startsWith(`${path}.`),
      ),
    ).toBe(true);
  };

  it('accepts a valid cache document and validates the Mongoose rates map entries', async () => {
    const document = makeDocument();

    expect(document.rates).toBeInstanceOf(Map);
    expect([...document.rates.entries()]).toEqual([
      ['USD', 1],
      ['EUR', 0.92],
    ]);
    await expect(document.validate()).resolves.toBeUndefined();
  });

  it('rejects a lowercase currency key', () => {
    return expectInvalid({ rates: { usd: 1 } }, 'rates');
  });

  it.each([
    { US: 1 },
    { EURO: 0.92 },
    { 'U$D': 1 },
  ])('rejects a currency key that is not exactly three uppercase letters: %j', async (rates) => {
    await expectInvalid({ rates }, 'rates');
  });

  it('rejects a zero rate', async () => {
    await expectInvalid({ rates: { USD: 1, EUR: 0 } }, 'rates');
  });

  it('rejects a negative rate', async () => {
    await expectInvalid({ rates: { USD: 1, EUR: -0.01 } }, 'rates');
  });

  it('rejects a rate value that is not a number', async () => {
    await expectInvalid({ rates: { USD: 1, EUR: 'not-a-number' } }, 'rates');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects a non-finite rate (%s)',
    async (rate) => {
      await expectInvalid({ rates: { USD: 1, EUR: rate } }, 'rates');
    },
  );

  it('rejects a date that does not use the YYYY-MM-DD format', async () => {
    await expectInvalid({ rateDate: '2026/02/28' }, 'rateDate');
  });

  it('rejects an impossible calendar date', async () => {
    await expectInvalid({ rateDate: '2026-02-30' }, 'rateDate');
  });

  it('accepts a valid leap-year date', async () => {
    const document = makeDocument({ rateDate: '2024-02-29' });

    await expect(document.validate()).resolves.toBeUndefined();
  });
});
