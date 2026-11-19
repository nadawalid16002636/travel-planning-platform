import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const FXRATES_API_LATEST_URL = 'https://api.fxratesapi.com/latest';
export const FXRATES_API_TIMEOUT_MS = 8_000;
export const FXRATES_API_PROVIDER = 'FXRatesAPI';
export const FXRATES_API_BASE_CURRENCY = 'USD';

export interface FxRatesApiSnapshot {
  provider: typeof FXRATES_API_PROVIDER;
  baseCurrency: typeof FXRATES_API_BASE_CURRENCY;
  /** Provider's rate date normalized to the UTC YYYY-MM-DD calendar date. */
  rateDate: string;
  /** Provider timestamp normalized from Unix seconds to a Date. */
  providerTimestamp?: Date;
  /** Rate units per one USD. The USD identity rate is always 1. */
  rates: Record<string, number>;
}

@Injectable()
export class FxRatesApiClient {
  constructor(private readonly config: ConfigService) {}

  async fetchLatestUsdDaily(): Promise<FxRatesApiSnapshot> {
    const apiKey = this.config.get<string>('FXRATES_API_KEY');
    if (typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new ServiceUnavailableException('FX provider is not configured');
    }

    const url = new URL(FXRATES_API_LATEST_URL);
    url.searchParams.set('api_key', apiKey.trim());
    url.searchParams.set('base', FXRATES_API_BASE_CURRENCY);
    url.searchParams.set('resolution', '1d');
    url.searchParams.set('format', 'json');

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(FXRATES_API_TIMEOUT_MS),
      });
    } catch (error) {
      // Do not retain the original error: fetch errors can contain the complete
      // request URL, including the provider API key query parameter.
      const name = error instanceof Error ? error.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new GatewayTimeoutException('FX provider request timed out');
      }
      throw new BadGatewayException('FX provider request failed');
    }

    if (!response.ok) {
      throw new BadGatewayException(
        `FX provider returned HTTP ${response.status}`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      // Provider response bodies are deliberately not included in exceptions.
      throw new BadGatewayException('FX provider returned malformed JSON');
    }

    return this.validatePayload(payload);
  }

  private validatePayload(payload: unknown): FxRatesApiSnapshot {
    if (!this.isRecord(payload) || payload.success !== true) {
      throw new BadGatewayException('FX provider returned an unsuccessful response');
    }

    const baseCurrency =
      typeof payload.base === 'string' ? payload.base.trim().toUpperCase() : '';
    if (baseCurrency !== FXRATES_API_BASE_CURRENCY) {
      throw new BadGatewayException('FX provider returned an unexpected base currency');
    }

    const rateDate = this.normalizeRateDate(payload.date);
    const providerTimestamp = this.normalizeProviderTimestamp(payload);
    const rates = this.normalizeRates(payload.rates);

    if (rates.USD !== undefined && rates.USD !== 1) {
      throw new BadGatewayException('FX provider returned an invalid base rate');
    }
    rates.USD = 1;

    return {
      provider: FXRATES_API_PROVIDER,
      baseCurrency: FXRATES_API_BASE_CURRENCY,
      rateDate,
      ...(providerTimestamp ? { providerTimestamp } : {}),
      rates,
    };
  }

  private normalizeRateDate(value: unknown): string {
    if (typeof value !== 'string') {
      throw new BadGatewayException('FX provider returned an invalid rate date');
    }

    const dateOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(value);
    const dateTime = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/i.exec(value);
    const datePart = dateOnly?.[1] ?? dateTime?.[1];
    if (!datePart) {
      throw new BadGatewayException('FX provider returned an invalid rate date');
    }

    const calendarDate = new Date(`${datePart}T00:00:00.000Z`);
    if (
      Number.isNaN(calendarDate.getTime()) ||
      calendarDate.toISOString().slice(0, 10) !== datePart
    ) {
      throw new BadGatewayException('FX provider returned an invalid rate date');
    }

    const parsed = new Date(dateOnly ? `${value}T00:00:00.000Z` : value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadGatewayException('FX provider returned an invalid rate date');
    }
    return parsed.toISOString().slice(0, 10);
  }

  private normalizeProviderTimestamp(payload: Record<string, unknown>) {
    if (!Object.prototype.hasOwnProperty.call(payload, 'timestamp')) return undefined;

    const timestamp = payload.timestamp;
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
      throw new BadGatewayException('FX provider returned an invalid timestamp');
    }

    const date = new Date(timestamp * 1_000);
    if (Number.isNaN(date.getTime())) {
      throw new BadGatewayException('FX provider returned an invalid timestamp');
    }
    return date;
  }

  private normalizeRates(value: unknown): Record<string, number> {
    if (!this.isRecord(value)) {
      throw new BadGatewayException('FX provider returned invalid rates');
    }

    const entries = Object.entries(value);
    if (entries.length === 0) {
      throw new BadGatewayException('FX provider returned an empty rates object');
    }

    const rates: Record<string, number> = {};
    for (const [rawCurrency, rate] of entries) {
      if (!/^[A-Za-z]{3}$/.test(rawCurrency)) {
        throw new BadGatewayException('FX provider returned an invalid currency code');
      }
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
        throw new BadGatewayException('FX provider returned an invalid rate');
      }

      const currency = rawCurrency.toUpperCase();
      if (Object.prototype.hasOwnProperty.call(rates, currency)) {
        throw new BadGatewayException('FX provider returned duplicate currency codes');
      }
      rates[currency] = rate;
    }
    return rates;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
