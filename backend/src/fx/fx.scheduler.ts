import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  FxCacheDatabaseError,
  FxService,
  FxSnapshotResult,
} from './fx.service.js';

export const FX_DAILY_REFRESH_CRON = '0 0 2 * * *';
export const FX_DAILY_REFRESH_TIME_ZONE = 'UTC';

@Injectable()
export class FxScheduler {
  private readonly logger = new Logger(FxScheduler.name);
  private refreshInFlight?: Promise<void>;

  constructor(private readonly fxService: FxService) {}

  /** Runs daily at 02:00 UTC; each app instance schedules its own execution. */
  @Cron(FX_DAILY_REFRESH_CRON, {
    name: 'fx-daily-snapshot-refresh',
    timeZone: FX_DAILY_REFRESH_TIME_ZONE,
    waitForCompletion: true,
  })
  refreshDailySnapshot(): Promise<void> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.refreshAndReport().finally(() => {
        this.refreshInFlight = undefined;
      });
    }
    return this.refreshInFlight;
  }

  private async refreshAndReport(): Promise<void> {
    try {
      const result = await this.fxService.refreshSnapshotOrFallback();
      this.reportResult(result);
    } catch (error) {
      this.logger.warn(
        error instanceof FxCacheDatabaseError
          ? 'FX daily refresh failed: cache database failure'
          : 'FX daily refresh failed: unexpected failure',
      );
    }
  }

  private reportResult(result: FxSnapshotResult): void {
    if (result.status === 'unavailable') {
      this.logger.warn('FX daily refresh unavailable: provider unavailable');
      return;
    }

    if (result.source === 'fresh') {
      this.logger.log('FX daily refresh completed: fresh snapshot');
      return;
    }

    if (result.source === 'cached_fallback') {
      const reason = result.fallbackReason ?? 'unknown';
      this.logger.warn(`FX daily refresh used cached fallback: ${reason}`);
      return;
    }

    this.logger.log('FX daily refresh completed: cached snapshot');
  }
}
