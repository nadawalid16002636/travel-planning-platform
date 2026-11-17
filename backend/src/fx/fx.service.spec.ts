import { Logger } from '@nestjs/common';
import { FxService, FxCacheDatabaseError } from './fx.service.js';
import {
  FXRATES_API_PROVIDER,
  FxRatesApiClient,
  FxRatesApiSnapshot,
} from './fxrates-api.client.js';

type SnapshotRecord = {
  provider: string;
  baseCurrency: string;
  rateDate: string;
  providerTimestamp?: Date;
  fetchedAt: Date;
  rates: Map<string, number> | Record<string, number>;
};

const makeSnapshot = (
  overrides: Partial<SnapshotRecord> = {},
): SnapshotRecord => ({
  provider: FXRATES_API_PROVIDER,
  baseCurrency: 'USD',
  rateDate: '2026-11-12',
  providerTimestamp: new Date('2026-11-12T12:00:00.000Z'),
  fetchedAt: new Date('2026-11-12T12:01:00.000Z'),
  rates: new Map([
    ['USD', 1],
    ['EUR', 0.92],
  ]),
  ...overrides,
});

const makeProviderSnapshot = (
  overrides: Partial<FxRatesApiSnapshot> = {},
): FxRatesApiSnapshot => ({
  provider: FXRATES_API_PROVIDER,
  baseCurrency: 'USD',
  rateDate: '2026-11-12',
  providerTimestamp: new Date('2026-11-12T12:00:00.000Z'),
  rates: { USD: 1, EUR: 0.92 },
  ...overrides,
});

describe('FxService', () => {
  let service: FxService;
  let cacheModel: {
    find: ReturnType<typeof vi.fn>;
    updateOne: ReturnType<typeof vi.fn>;
  };
  let apiClient: { fetchLatestUsdDaily: ReturnType<typeof vi.fn> };
  let queryResults: unknown[][];
  let readError: unknown;
  let writeError: unknown;
  let sortSpy: ReturnType<typeof vi.fn>;
  let updateExecutions: { filter: unknown; update: unknown; options: unknown }[];

  const enqueueRead = (records: unknown[]) => queryResults.push(records);

  beforeEach(() => {
    vi.restoreAllMocks();
    queryResults = [];
    readError = undefined;
    writeError = undefined;
    updateExecutions = [];
    sortSpy = vi.fn();
    cacheModel = {
      find: vi.fn(() => ({
        sort: sortSpy.mockReturnThis(),
        exec: vi.fn(async () => {
          if (readError) throw readError;
          return queryResults.shift() ?? [];
        }),
      })),
      updateOne: vi.fn((filter, update, options = {}) => ({
        exec: vi.fn(async () => {
          updateExecutions.push({ filter, update, options });
          if (writeError) throw writeError;
          return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: options.upsert ? 1 : 0 };
        }),
      })),
    };
    apiClient = { fetchLatestUsdDaily: vi.fn() };
    service = new FxService(
      cacheModel as never,
      apiClient as unknown as FxRatesApiClient,
    );
  });

  afterEach(() => vi.useRealTimers());

  it('persists a fresh validated provider snapshot', async () => {
    apiClient.fetchLatestUsdDaily.mockResolvedValue(makeProviderSnapshot());
    enqueueRead([]);
    enqueueRead([makeSnapshot()]);

    const result = await service.refreshSnapshotOrFallback();

    expect(result.status).toBe('available');
    if (result.status !== 'available') throw new Error('expected available');
    expect(result.source).toBe('fresh');
    expect(result.snapshot.rateDate).toBe('2026-11-12');
    expect(updateExecutions).toHaveLength(1);
    expect(updateExecutions[0].options).toEqual({ upsert: true });
    expect(updateExecutions[0].filter).toEqual({
      provider: FXRATES_API_PROVIDER,
      baseCurrency: 'USD',
      rateDate: '2026-11-12',
    });
  });

  it('assigns fetchedAt from the backend clock', async () => {
    const backendNow = new Date('2026-11-13T09:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(backendNow);
    apiClient.fetchLatestUsdDaily.mockResolvedValue(
      makeProviderSnapshot({ fetchedAt: new Date('1999-01-01') } as Partial<FxRatesApiSnapshot>),
    );
    enqueueRead([]);
    enqueueRead([makeSnapshot()]);

    const result = await service.refreshSnapshotOrFallback();

    expect(result.status).toBe('available');
    if (result.status !== 'available') throw new Error('expected available');
    expect(result.snapshot.fetchedAt).toEqual(backendNow);
    expect((updateExecutions[0].update as any).$set.fetchedAt).toEqual(backendNow);
  });

  it('selects the newest valid cached snapshot using the required sort order', async () => {
    const newest = makeSnapshot({ rateDate: '2026-11-13' });
    // Mongoose applies the requested sort before returning these records.
    enqueueRead([newest, makeSnapshot({ rateDate: '2026-11-12' })]);

    const result = await service.getLatestCachedSnapshot();

    expect(result?.rateDate).toBe('2026-11-13');
    expect(sortSpy).toHaveBeenCalledWith({
      rateDate: -1,
      providerTimestamp: -1,
      fetchedAt: -1,
    });
    expect(cacheModel.find).toHaveBeenCalledWith({ provider: FXRATES_API_PROVIDER, baseCurrency: 'USD' });
  });

  it('skips an invalid newest record and returns an older valid record', async () => {
    enqueueRead([
      makeSnapshot({ rateDate: '2026-11-13', rates: new Map([['bad', 1]]) }),
      makeSnapshot({ rateDate: '2026-11-12', rates: { USD: 1, EUR: 0.92 } }),
    ]);

    const result = await service.getLatestCachedSnapshot();

    expect(result?.rateDate).toBe('2026-11-12');
    expect(result?.rates).toEqual({ USD: 1, EUR: 0.92 });
  });

  it('skips a cached record with an invalid USD identity rate', async () => {
    enqueueRead([
      makeSnapshot({ rateDate: '2026-11-13', rates: { USD: 2, EUR: 0.92 } }),
      makeSnapshot({ rateDate: '2026-11-12' }),
    ]);

    const result = await service.getLatestCachedSnapshot();

    expect(result?.rateDate).toBe('2026-11-12');
  });

  it('returns a cache hit at startup without calling the provider', async () => {
    enqueueRead([makeSnapshot()]);

    const result = await service.ensureInitialSnapshot();

    expect(result).toMatchObject({ status: 'available', source: 'cached' });
    expect(apiClient.fetchLatestUsdDaily).not.toHaveBeenCalled();
  });

  it('fetches and stores the initial snapshot when the cache is empty', async () => {
    apiClient.fetchLatestUsdDaily.mockResolvedValue(makeProviderSnapshot());
    enqueueRead([]);
    enqueueRead([]);
    enqueueRead([makeSnapshot()]);

    const result = await service.ensureInitialSnapshot();

    expect(result).toMatchObject({ status: 'available', source: 'fresh' });
    expect(apiClient.fetchLatestUsdDaily).toHaveBeenCalledOnce();
    expect(updateExecutions).toHaveLength(1);
  });

  it('uses a valid cached snapshot when the provider fails without writing', async () => {
    apiClient.fetchLatestUsdDaily.mockRejectedValue(new Error('sanitized provider failure'));
    enqueueRead([makeSnapshot()]);

    const result = await service.refreshSnapshotOrFallback();

    expect(result).toMatchObject({ status: 'available', source: 'cached_fallback', fallbackReason: 'provider_unavailable' });
    expect(updateExecutions).toHaveLength(0);
  });

  it('returns unavailable when the provider fails and no valid cache exists', async () => {
    apiClient.fetchLatestUsdDaily.mockRejectedValue(new Error('provider failure'));
    enqueueRead([]);

    await expect(service.refreshSnapshotOrFallback()).resolves.toEqual({
      status: 'unavailable',
      reason: 'provider_unavailable',
    });
    expect(updateExecutions).toHaveLength(0);
  });

  it('rejects an older provider rate date and returns the cached fallback', async () => {
    apiClient.fetchLatestUsdDaily.mockResolvedValue(makeProviderSnapshot({ rateDate: '2026-11-11' }));
    enqueueRead([makeSnapshot({ rateDate: '2026-11-12' })]);

    const result = await service.refreshSnapshotOrFallback();

    expect(result).toMatchObject({ status: 'available', source: 'cached_fallback', fallbackReason: 'provider_stale' });
    expect(updateExecutions).toHaveLength(0);
  });

  it('rejects an older provider timestamp for the same date', async () => {
    apiClient.fetchLatestUsdDaily.mockResolvedValue(makeProviderSnapshot({ providerTimestamp: new Date('2026-11-12T11:00:00Z') }));
    enqueueRead([makeSnapshot()]);

    const result = await service.refreshSnapshotOrFallback();

    expect(result).toMatchObject({ status: 'available', source: 'cached_fallback', fallbackReason: 'provider_stale' });
    expect(updateExecutions).toHaveLength(0);
  });

  it('conditionally updates a same-date record when the provider timestamp is newer', async () => {
    const existing = makeSnapshot({
      providerTimestamp: new Date('2026-11-12T11:00:00.000Z'),
      rates: new Map([['USD', 1], ['EUR', 0.90]]),
    });
    const updated = makeSnapshot({
      providerTimestamp: new Date('2026-11-12T13:00:00.000Z'),
      fetchedAt: new Date('2026-11-12T13:01:00.000Z'),
      rates: new Map([['USD', 1], ['EUR', 0.95]]),
    });
    apiClient.fetchLatestUsdDaily.mockResolvedValue(makeProviderSnapshot({
      providerTimestamp: updated.providerTimestamp,
      rates: { USD: 1, EUR: 0.95 },
    }));
    enqueueRead([existing]);
    enqueueRead([updated]);

    const result = await service.refreshSnapshotOrFallback();

    expect(cacheModel.updateOne).toHaveBeenCalledOnce();
    expect(cacheModel.updateOne.mock.calls[0][0]).toEqual({
      provider: FXRATES_API_PROVIDER,
      baseCurrency: 'USD',
      rateDate: '2026-11-12',
      providerTimestamp: { $lte: updated.providerTimestamp },
    });
    expect((updateExecutions[0].update as any).$set.rates).toEqual({ USD: 1, EUR: 0.95 });
    expect(result).toMatchObject({ status: 'available', source: 'fresh' });
    if (result.status === 'available') {
      expect(result.snapshot.providerTimestamp).toEqual(updated.providerTimestamp);
      expect(result.snapshot.rates).toEqual({ USD: 1, EUR: 0.95 });
    }

    apiClient.fetchLatestUsdDaily.mockResolvedValue(makeProviderSnapshot({
      providerTimestamp: new Date('2026-11-12T12:00:00.000Z'),
      rates: { USD: 1, EUR: 0.91 },
    }));
    enqueueRead([updated]);
    const olderResult = await service.refreshSnapshotOrFallback();

    expect(cacheModel.updateOne).toHaveBeenCalledOnce();
    expect(olderResult).toMatchObject({
      status: 'available',
      source: 'cached_fallback',
      fallbackReason: 'provider_stale',
    });
    if (olderResult.status === 'available') {
      expect(olderResult.snapshot.rates).toEqual({ USD: 1, EUR: 0.95 });
    }
  });

  it.each([
    ['incoming timestamp missing', undefined, new Date('2026-11-12T12:00:00Z')],
    ['stored timestamp missing', new Date('2026-11-12T13:00:00Z'), undefined],
  ])('preserves the same-date snapshot when %s', async (_label, incomingTimestamp, storedTimestamp) => {
    apiClient.fetchLatestUsdDaily.mockResolvedValue(makeProviderSnapshot({ providerTimestamp: incomingTimestamp as Date | undefined }));
    enqueueRead([makeSnapshot({ providerTimestamp: storedTimestamp as Date | undefined })]);

    const result = await service.refreshSnapshotOrFallback();

    expect(result).toMatchObject({ status: 'available', source: 'cached_fallback', fallbackReason: 'provider_stale' });
    expect(updateExecutions).toHaveLength(0);
  });

  it('shares one provider fetch and one write across concurrent refresh calls', async () => {
    let resolveFetch!: (snapshot: FxRatesApiSnapshot) => void;
    apiClient.fetchLatestUsdDaily.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const first = service.refreshSnapshotOrFallback();
    const second = service.refreshSnapshotOrFallback();

    expect(second).toBe(first);
    expect(apiClient.fetchLatestUsdDaily).toHaveBeenCalledOnce();
    resolveFetch(makeProviderSnapshot());
    enqueueRead([]);
    enqueueRead([makeSnapshot()]);

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(updateExecutions).toHaveLength(1);
  });

  it('clears the single-flight promise after success so a later refresh can start', async () => {
    const firstSnapshot = makeProviderSnapshot();
    const secondSnapshot = makeProviderSnapshot({
      providerTimestamp: new Date('2026-11-12T13:00:00.000Z'),
      rates: { USD: 1, EUR: 0.94 },
    });
    apiClient.fetchLatestUsdDaily
      .mockResolvedValueOnce(firstSnapshot)
      .mockResolvedValueOnce(secondSnapshot);
    enqueueRead([]);
    enqueueRead([makeSnapshot()]);
    enqueueRead([makeSnapshot()]);
    enqueueRead([makeSnapshot({ providerTimestamp: secondSnapshot.providerTimestamp, rates: secondSnapshot.rates })]);

    await service.refreshSnapshotOrFallback();
    const subsequent = await service.refreshSnapshotOrFallback();

    expect(apiClient.fetchLatestUsdDaily).toHaveBeenCalledTimes(2);
    expect(subsequent).toMatchObject({ status: 'available', source: 'fresh' });
  });

  it('clears the single-flight promise after failure so a later refresh can start', async () => {
    const snapshot = makeProviderSnapshot();
    apiClient.fetchLatestUsdDaily
      .mockRejectedValueOnce(new Error('first provider failure'))
      .mockResolvedValueOnce(snapshot);
    enqueueRead([]);
    enqueueRead([]);
    enqueueRead([makeSnapshot()]);

    await expect(service.refreshSnapshotOrFallback()).resolves.toEqual({
      status: 'unavailable',
      reason: 'provider_unavailable',
    });
    const subsequent = await service.refreshSnapshotOrFallback();

    expect(apiClient.fetchLatestUsdDaily).toHaveBeenCalledTimes(2);
    expect(subsequent).toMatchObject({ status: 'available', source: 'fresh' });
  });

  it('reloads and returns the winner after a duplicate-key upsert race', async () => {
    apiClient.fetchLatestUsdDaily.mockResolvedValue(makeProviderSnapshot());
    enqueueRead([]);
    const winner = makeSnapshot({ providerTimestamp: new Date('2026-11-12T13:00:00Z') });
    enqueueRead([winner]);
    cacheModel.updateOne.mockImplementationOnce(() => ({
      exec: vi.fn().mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 })),
    }));

    const result = await service.refreshSnapshotOrFallback();

    expect(result).toMatchObject({ status: 'available', source: 'cached_fallback', fallbackReason: 'provider_stale' });
    if (result.status === 'available') expect(result.snapshot.providerTimestamp).toEqual(winner.providerTimestamp);
  });

  it('rechecks the latest record after persistence when another instance inserts a newer date', async () => {
    let releaseOlderWrite!: () => void;
    let signalOlderWriteStarted!: () => void;
    const olderWriteGate = new Promise<void>((resolve) => { releaseOlderWrite = resolve; });
    const olderWriteStarted = new Promise<void>((resolve) => { signalOlderWriteStarted = resolve; });
    const records: SnapshotRecord[] = [makeSnapshot({
      rateDate: '2026-11-10',
      providerTimestamp: new Date('2026-11-10T12:00:00.000Z'),
    })];
    const sharedModel = {
      find: vi.fn(() => {
        let requestedSort: Record<string, -1 | 1> = {};
        const query = {
          sort: vi.fn((sort: Record<string, -1 | 1>) => {
            requestedSort = sort;
            return query;
          }),
          exec: vi.fn(async () => [...records].sort((left, right) => {
            for (const [field, direction] of Object.entries(requestedSort)) {
              const leftValue = left[field as keyof SnapshotRecord];
              const rightValue = right[field as keyof SnapshotRecord];
              const leftComparable = leftValue instanceof Date ? leftValue.getTime() : leftValue;
              const rightComparable = rightValue instanceof Date ? rightValue.getTime() : rightValue;
              if (leftComparable === rightComparable) continue;
              return (leftComparable! < rightComparable! ? -1 : 1) * direction;
            }
            return 0;
          })),
        };
        return query;
      }),
      updateOne: vi.fn((filter, update) => ({
        exec: vi.fn(async () => {
          const candidate = (update as any).$set as SnapshotRecord;
          if (candidate.rateDate === '2026-11-12') {
            signalOlderWriteStarted();
            await olderWriteGate;
          }
          const existingIndex = records.findIndex((record) =>
            record.provider === filter.provider &&
            record.baseCurrency === filter.baseCurrency &&
            record.rateDate === filter.rateDate,
          );
          if (existingIndex >= 0) records[existingIndex] = candidate;
          else records.push(candidate);
          return { acknowledged: true, matchedCount: existingIndex >= 0 ? 1 : 0, modifiedCount: 1, upsertedCount: existingIndex < 0 ? 1 : 0 };
        }),
      })),
    };
    const olderClient = { fetchLatestUsdDaily: vi.fn().mockResolvedValue(makeProviderSnapshot({
      rateDate: '2026-11-12',
      providerTimestamp: new Date('2026-11-12T12:00:00.000Z'),
      rates: { USD: 1, EUR: 0.92 },
    })) };
    const newerClient = { fetchLatestUsdDaily: vi.fn().mockResolvedValue(makeProviderSnapshot({
      rateDate: '2026-11-13',
      providerTimestamp: new Date('2026-11-13T12:00:00.000Z'),
      rates: { USD: 1, EUR: 0.93 },
    })) };
    const olderInstance = new FxService(sharedModel as never, olderClient as unknown as FxRatesApiClient);
    const newerInstance = new FxService(sharedModel as never, newerClient as unknown as FxRatesApiClient);

    const olderRefresh = olderInstance.refreshSnapshotOrFallback();
    await olderWriteStarted;
    const newerResult = await newerInstance.refreshSnapshotOrFallback();
    releaseOlderWrite();
    const olderResult = await olderRefresh;

    expect(newerResult).toMatchObject({ status: 'available', source: 'fresh' });
    expect(olderResult).toMatchObject({
      status: 'available',
      source: 'cached_fallback',
      fallbackReason: 'provider_stale',
    });
    if (olderResult.status === 'available') expect(olderResult.snapshot.rateDate).toBe('2026-11-13');
    expect(records.map((record) => record.rateDate).sort()).toEqual(['2026-11-10', '2026-11-12', '2026-11-13']);
  });

  it('does not fetch after a database read failure', async () => {
    readError = new Error('database offline');

    await expect(service.ensureInitialSnapshot()).rejects.toBeInstanceOf(FxCacheDatabaseError);
    expect(apiClient.fetchLatestUsdDaily).not.toHaveBeenCalled();
  });

  it('propagates a database write failure rather than returning provider unavailable', async () => {
    apiClient.fetchLatestUsdDaily.mockResolvedValue(makeProviderSnapshot());
    enqueueRead([]);
    writeError = new Error('database write failed');

    await expect(service.refreshSnapshotOrFallback()).rejects.toBeInstanceOf(FxCacheDatabaseError);
  });

  it('does not let a startup provider failure reject bootstrap or expose provider details', async () => {
    const loggerSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    apiClient.fetchLatestUsdDaily.mockRejectedValue(new Error('secret=api-key-in-url'));
    enqueueRead([]);

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    await vi.waitFor(() => expect(loggerSpy).toHaveBeenCalledOnce());
    expect(loggerSpy).toHaveBeenCalledWith('FX initial snapshot unavailable: provider failure');
    expect(String(loggerSpy.mock.calls[0][0])).not.toContain('api-key-in-url');
  });

  it('catches and sanitizes a startup database failure', async () => {
    const loggerSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    readError = new Error('mongodb uri secret');

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    await vi.waitFor(() => expect(loggerSpy).toHaveBeenCalledOnce());
    expect(loggerSpy).toHaveBeenCalledWith('FX initial snapshot unavailable: cache database failure');
    expect(String(loggerSpy.mock.calls[0][0])).not.toContain('secret');
  });

  it('does not expose provider secrets in unavailable results or returned cached values', async () => {
    apiClient.fetchLatestUsdDaily.mockRejectedValue(new Error('https://provider?api_key=secret-value'));
    enqueueRead([]);

    const result = await service.refreshSnapshotOrFallback();

    expect(JSON.stringify(result)).not.toContain('secret-value');
    expect(result).toEqual({ status: 'unavailable', reason: 'provider_unavailable' });
  });
});
