import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FxRateCache, FxRateCacheSchema } from './fx-rate-cache.schema.js';
import { FxRatesApiClient } from './fxrates-api.client.js';
import { FxService } from './fx.service.js';
import { FxScheduler } from './fx.scheduler.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FxRateCache.name, schema: FxRateCacheSchema },
    ]),
  ],
  controllers: [],
  providers: [FxRatesApiClient, FxService, FxScheduler],
  exports: [FxRatesApiClient, FxService],
})
export class FxModule {}
