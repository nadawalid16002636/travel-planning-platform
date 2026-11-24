import { Logger } from '@nestjs/common';
import { FxCacheDatabaseError, FxService, FxSnapshotResult } from './fx.service.js';
import {
  FX_DAILY_REFRESH_CRON,
  FX_DAILY_REFRESH_TIME_ZONE,
  FxScheduler,
} from './fx.scheduler.js';

const availableResult = (
  source: 'fresh' | 'cached' | 'cached_fallback',
  fallbackReason?: 'provider_stale' | 'provider_unavailable',
): FxSnapshotResult => ({
  status: 'available',
  source,
  ...(fallbackReason ? { fallbackReason } : {}),
  snapshot: {
    provider: 'FXRatesAPI',
    baseCurrency: 'USD',
    rateDate: '2026-11-13',
    providerTimestamp: new Date('2026-11-13T12:00:00.000Z'),
    fetchedAt: new Date('2026-11-13T12:01:00.000Z'),
    rates: { USD: 1, EUR: 0.92 },
  },
});

describe('FxScheduler', () => {
  let scheduler: FxScheduler;
  let fxService: { refreshSnapshotOrFallback: ReturnType<typeof vi.fn> };
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    fxService = { refreshSnapshotOrFallback: vi.fn() };
    scheduler = new FxScheduler(fxService as unknown as FxService);
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('delegates refresh work to FxService and reports a fresh snapshot', async () => {
    fxService.refreshSnapshotOrFallback.mockResolvedValue(availableResult('fresh'));

    await scheduler.refreshDailySnapshot();

    expect(fxService.refreshSnapshotOrFallback).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledWith('FX daily refresh completed: fresh snapshot');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('shares one refresh among concurrent invocations', async () => {
    let resolveRefresh!: (result: FxSnapshotResult) => void;
    fxService.refreshSnapshotOrFallback.mockReturnValue(
      new Promise((resolve) => { resolveRefresh = resolve; }),
    );

    const first = scheduler.refreshDailySnapshot();
    const second = scheduler.refreshDailySnapshot();

    expect(second).toBe(first);
    expect(fxService.refreshSnapshotOrFallback).toHaveBeenCalledOnce();
    resolveRefresh(availableResult('fresh'));
    await Promise.all([first, second]);
  });

  it('allows a subsequent invocation after success', async () => {
    fxService.refreshSnapshotOrFallback
      .mockResolvedValueOnce(availableResult('fresh'))
      .mockResolvedValueOnce(availableResult('fresh'));

    await scheduler.refreshDailySnapshot();
    await scheduler.refreshDailySnapshot();

    expect(fxService.refreshSnapshotOrFallback).toHaveBeenCalledTimes(2);
  });

  it('allows a subsequent invocation after an unexpected failure', async () => {
    fxService.refreshSnapshotOrFallback
      .mockRejectedValueOnce(new Error('credential-bearing URL or raw details'))
      .mockResolvedValueOnce(availableResult('fresh'));

    await expect(scheduler.refreshDailySnapshot()).resolves.toBeUndefined();
    await expect(scheduler.refreshDailySnapshot()).resolves.toBeUndefined();

    expect(fxService.refreshSnapshotOrFallback).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith('FX daily refresh failed: unexpected failure');
    expect(String(warnSpy.mock.calls[0][0])).not.toContain('credential-bearing');
  });

  it('handles provider-unavailable results distinctly and never logs success', async () => {
    fxService.refreshSnapshotOrFallback.mockResolvedValue({
      status: 'unavailable',
      reason: 'provider_unavailable',
    });

    await scheduler.refreshDailySnapshot();

    expect(warnSpy).toHaveBeenCalledWith('FX daily refresh unavailable: provider unavailable');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('reports cached fallback without treating it as a fresh refresh', async () => {
    fxService.refreshSnapshotOrFallback.mockResolvedValue(
      availableResult('cached_fallback', 'provider_stale'),
    );

    await scheduler.refreshDailySnapshot();

    expect(warnSpy).toHaveBeenCalledWith('FX daily refresh used cached fallback: provider_stale');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('reports database failures distinctly from provider unavailability', async () => {
    fxService.refreshSnapshotOrFallback.mockRejectedValue(
      new FxCacheDatabaseError('read'),
    );

    await expect(scheduler.refreshDailySnapshot()).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith('FX daily refresh failed: cache database failure');
    expect(warnSpy).not.toHaveBeenCalledWith('FX daily refresh unavailable: provider unavailable');
  });

  it('does not call a provider or database directly', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    fxService.refreshSnapshotOrFallback.mockResolvedValue(availableResult('fresh'));

    await scheduler.refreshDailySnapshot();

    expect(fxService.refreshSnapshotOrFallback).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(Object.keys(scheduler)).not.toContain('cacheModel');
    expect(Object.keys(scheduler)).not.toContain('apiClient');
  });

  it('registers the cron expression and explicit UTC timezone', () => {
    const options = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      FxScheduler.prototype.refreshDailySnapshot,
    );

    expect(FX_DAILY_REFRESH_CRON).toBe('0 0 2 * * *');
    expect(FX_DAILY_REFRESH_TIME_ZONE).toBe('UTC');
    expect(options).toMatchObject({
      cronTime: '0 0 2 * * *',
      timeZone: 'UTC',
      name: 'fx-daily-snapshot-refresh',
    });
  });

  it('enables scheduler-level waitForCompletion when supported', () => {
    const options = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      FxScheduler.prototype.refreshDailySnapshot,
    );

    expect(options.waitForCompletion).toBe(true);
  });
});
