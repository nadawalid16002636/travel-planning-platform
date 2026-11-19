import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  FXRATES_API_BASE_CURRENCY,
  FXRATES_API_PROVIDER,
  FxRatesApiClient,
  FxRatesApiSnapshot,
} from './fxrates-api.client.js';
import { FxRateCache } from './fx-rate-cache.schema.js';

export interface FxCachedSnapshot {
  provider: typeof FXRATES_API_PROVIDER;
  baseCurrency: typeof FXRATES_API_BASE_CURRENCY;
  rateDate: string;
  providerTimestamp?: Date;
  fetchedAt: Date;
  rates: Record<string, number>;
}

export type FxSnapshotResult =
  | {
      status: 'available';
      source: 'fresh' | 'cached' | 'cached_fallback';
      snapshot: FxCachedSnapshot;
      fallbackReason?: 'provider_stale' | 'provider_unavailable';
    }
  | {
      status: 'unavailable';
      reason: 'provider_unavailable';
    };

/** Identifiable persistence/query error; deliberately excludes the raw exception. */
export class FxCacheDatabaseError extends Error {
  readonly code = 'FX_CACHE_DATABASE_ERROR';

  constructor(operation: 'read' | 'write') {
    super(`FX cache database ${operation} failed`);
    this.name = 'FxCacheDatabaseError';
  }
}

const RATE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class FxService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FxService.name);
  private refreshInFlight?: Promise<FxSnapshotResult>;

  constructor(
    @InjectModel(FxRateCache.name)
    private readonly cacheModel: Model<FxRateCache>,
    private readonly apiClient: FxRatesApiClient,
  ) {}

  async getLatestCachedSnapshot(): Promise<FxCachedSnapshot | null> {
    let records: unknown[];
    try {
      records = await this.cacheModel
        .find({
          provider: FXRATES_API_PROVIDER,
          baseCurrency: FXRATES_API_BASE_CURRENCY,
        })
        .sort({ rateDate: -1, providerTimestamp: -1, fetchedAt: -1 })
        .exec();
    } catch {
      throw new FxCacheDatabaseError('read');
    }

    for (const record of records) {
      const snapshot = this.toValidSnapshot(record);
      if (snapshot) return snapshot;
    }
    return null;
  }

  refreshSnapshotOrFallback(): Promise<FxSnapshotResult> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.performRefresh().finally(() => {
        this.refreshInFlight = undefined;
      });
    }
    return this.refreshInFlight;
  }

  async ensureInitialSnapshot(): Promise<FxSnapshotResult> {
    const cached = await this.getLatestCachedSnapshot();
    if (cached) return { status: 'available', source: 'cached', snapshot: cached };
    return this.refreshSnapshotOrFallback();
  }

  async onApplicationBootstrap(): Promise<void> {
    // Do not hold Nest startup open for an optional provider request. Explicitly
    // catch the promise so startup cannot produce an unhandled rejection.
    void this.ensureInitialSnapshot()
      .then((result) => {
        if (result.status === 'unavailable') {
          this.logger.warn('FX initial snapshot unavailable: provider failure');
        }
      })
      .catch((error: unknown) => {
        this.logger.warn(this.startupFailureCategory(error));
      });
  }

  private async performRefresh(): Promise<FxSnapshotResult> {
    let providerSnapshot: FxRatesApiSnapshot;
    try {
      providerSnapshot = await this.apiClient.fetchLatestUsdDaily();
    } catch {
      const cached = await this.getLatestCachedSnapshot();
      return cached
        ? {
            status: 'available',
            source: 'cached_fallback',
            snapshot: cached,
            fallbackReason: 'provider_unavailable',
          }
        : { status: 'unavailable', reason: 'provider_unavailable' };
    }

    // Capture backend fetch time only after the provider returned a validated
    // snapshot. The provider payload cannot supply or override this value.
    const incoming: FxCachedSnapshot = {
      provider: providerSnapshot.provider,
      baseCurrency: providerSnapshot.baseCurrency,
      rateDate: providerSnapshot.rateDate,
      ...(providerSnapshot.providerTimestamp
        ? { providerTimestamp: new Date(providerSnapshot.providerTimestamp) }
        : {}),
      fetchedAt: new Date(),
      rates: { ...providerSnapshot.rates },
    };

    const current = await this.getLatestCachedSnapshot();
    if (current && this.isStale(incoming, current)) {
      return {
        status: 'available',
        source: 'cached_fallback',
        snapshot: current,
        fallbackReason: 'provider_stale',
      };
    }

    try {
      const persisted = await this.persistSnapshot(incoming, current);
      if (persisted) {
        // Another process may have persisted a later dated snapshot after the
        // earlier read. Recheck after the write so this call never reports its
        // now-stale candidate as fresh.
        const latest = await this.getLatestCachedSnapshot();
        if (!latest) throw new FxCacheDatabaseError('read');
        if (this.isNewerSnapshot(latest, persisted)) {
          return {
            status: 'available',
            source: 'cached_fallback',
            snapshot: latest,
            fallbackReason: 'provider_stale',
          };
        }
        return { status: 'available', source: 'fresh', snapshot: persisted };
      }

      const winner = await this.getLatestCachedSnapshot();
      if (!winner) throw new FxCacheDatabaseError('read');
      return {
        status: 'available',
        source: 'cached_fallback',
        snapshot: winner,
        fallbackReason: 'provider_stale',
      };
    } catch (error) {
      if (error instanceof FxCacheDatabaseError) throw error;
      if (this.isDuplicateKeyError(error)) {
        const winner = await this.getLatestCachedSnapshot();
        if (winner) {
          return {
            status: 'available',
            source: 'cached_fallback',
            snapshot: winner,
            fallbackReason: 'provider_stale',
          };
        }
      }
      throw new FxCacheDatabaseError('write');
    }
  }

  private async persistSnapshot(
    incoming: FxCachedSnapshot,
    current: FxCachedSnapshot | null,
  ): Promise<FxCachedSnapshot | null> {
    const key = {
      provider: incoming.provider,
      baseCurrency: incoming.baseCurrency,
      rateDate: incoming.rateDate,
    };
    const update = {
      $set: {
        provider: incoming.provider,
        baseCurrency: incoming.baseCurrency,
        rateDate: incoming.rateDate,
        providerTimestamp: incoming.providerTimestamp,
        fetchedAt: incoming.fetchedAt,
        rates: incoming.rates,
      },
    };

    try {
      if (current?.rateDate === incoming.rateDate) {
        const filter: Record<string, unknown> = {
          ...key,
          ...(current.providerTimestamp
            ? { providerTimestamp: { $lte: incoming.providerTimestamp } }
            : { providerTimestamp: { $exists: false } }),
        };
        if (!incoming.providerTimestamp) return null;

        const result = await this.cacheModel.updateOne(filter, update).exec();
        if (result.modifiedCount === 0) return null;
      } else {
        await this.cacheModel.updateOne(key, update, { upsert: true }).exec();
      }
    } catch (error) {
      if (this.isDuplicateKeyError(error)) throw error;
      throw new FxCacheDatabaseError('write');
    }

    return incoming;
  }

  private isStale(incoming: FxCachedSnapshot, current: FxCachedSnapshot): boolean {
    if (incoming.rateDate < current.rateDate) return true;
    if (incoming.rateDate > current.rateDate) return false;

    // Timestamp absence makes ordering unknowable; retain the already stored
    // same-day snapshot instead of replacing it on an assumption.
    if (!incoming.providerTimestamp || !current.providerTimestamp) return true;
    return incoming.providerTimestamp.getTime() < current.providerTimestamp.getTime();
  }

  private isNewerSnapshot(
    candidate: FxCachedSnapshot,
    baseline: FxCachedSnapshot,
  ): boolean {
    if (candidate.rateDate > baseline.rateDate) return true;
    if (candidate.rateDate < baseline.rateDate) return false;
    if (!candidate.providerTimestamp || !baseline.providerTimestamp) return false;
    return candidate.providerTimestamp.getTime() > baseline.providerTimestamp.getTime();
  }

  private toValidSnapshot(value: unknown): FxCachedSnapshot | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    if (
      record.provider !== FXRATES_API_PROVIDER ||
      record.baseCurrency !== FXRATES_API_BASE_CURRENCY ||
      typeof record.rateDate !== 'string' ||
      !this.isValidDateOnly(record.rateDate) ||
      !(record.fetchedAt instanceof Date) ||
      Number.isNaN(record.fetchedAt.getTime())
    ) {
      return null;
    }

    if (
      record.providerTimestamp !== undefined &&
      record.providerTimestamp !== null &&
      (!(record.providerTimestamp instanceof Date) ||
        Number.isNaN(record.providerTimestamp.getTime()))
    ) {
      return null;
    }

    const entries = this.rateEntries(record.rates);
    if (!entries || entries.length === 0) return null;
    const rates: Record<string, number> = {};
    for (const [currency, rate] of entries) {
      if (
        !/^[A-Z]{3}$/.test(currency) ||
        typeof rate !== 'number' ||
        !Number.isFinite(rate) ||
        rate <= 0
      ) {
        return null;
      }
      rates[currency] = rate;
    }
    if (rates.USD !== 1) return null;

    return {
      provider: FXRATES_API_PROVIDER,
      baseCurrency: FXRATES_API_BASE_CURRENCY,
      rateDate: record.rateDate,
      ...(record.providerTimestamp instanceof Date
        ? { providerTimestamp: new Date(record.providerTimestamp) }
        : {}),
      fetchedAt: new Date(record.fetchedAt),
      rates,
    };
  }

  private rateEntries(value: unknown): [string, unknown][] | null {
    if (value instanceof Map) return [...value.entries()];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.entries(value as Record<string, unknown>);
    }
    return null;
  }

  private isValidDateOnly(value: string): boolean {
    if (!RATE_DATE_PATTERN.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000
    );
  }

  private startupFailureCategory(error: unknown): string {
    return error instanceof FxCacheDatabaseError
      ? 'FX initial snapshot unavailable: cache database failure'
      : 'FX initial snapshot unavailable';
  }
}
