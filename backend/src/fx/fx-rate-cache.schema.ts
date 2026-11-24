import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

const RATE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !RATE_DATE_PATTERN.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidRatesMap(value: unknown): boolean {
  if (!(value instanceof Map)) return false;

  for (const [currency, rate] of value.entries()) {
    if (
      typeof currency !== 'string' ||
      !/^[A-Z]{3}$/.test(currency) ||
      typeof rate !== 'number' ||
      !Number.isFinite(rate) ||
      rate <= 0
    ) {
      return false;
    }
  }
  return value.size > 0;
}

/** A validated, dated FXRatesAPI snapshot. `rateDate` is a UTC YYYY-MM-DD string. */
@Schema({ collection: 'fx_rate_cache', versionKey: false })
export class FxRateCache {
  @Prop({ required: true, type: String })
  provider: string;

  @Prop({ required: true, type: String, uppercase: true, trim: true })
  baseCurrency: string;

  @Prop({
    required: true,
    type: String,
    match: RATE_DATE_PATTERN,
    validate: {
      validator: isValidDateOnly,
      message: 'rateDate must be a valid UTC YYYY-MM-DD calendar date',
    },
  })
  rateDate: string;

  @Prop({ type: Date })
  providerTimestamp?: Date;

  @Prop({ required: true, type: Date })
  fetchedAt: Date;

  @Prop({
    required: true,
    type: Map,
    of: Number,
    validate: {
      validator: isValidRatesMap,
      message: 'rates must contain uppercase three-letter currency codes and positive finite numbers',
    },
  })
  rates: Map<string, number>;
}

export const FxRateCacheSchema = SchemaFactory.createForClass(FxRateCache);
FxRateCacheSchema.index(
  { provider: 1, baseCurrency: 1, rateDate: 1 },
  { unique: true },
);
