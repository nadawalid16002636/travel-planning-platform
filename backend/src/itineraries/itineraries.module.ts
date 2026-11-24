import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ItinerariesController } from './itineraries.controller.js';
import { ItinerariesService } from './itineraries.service.js';
import { Itinerary, ItinerarySchema } from './itinerary.schema.js';
import { UsersModule } from '../users/users.module.js';
import { FxModule } from '../fx/fx.module.js';
import { HotelsModule } from '../hotels/hotels.module.js';
import { P2Module } from '../p2/p2.module.js';

@Module({
  imports: [
    UsersModule,
    FxModule,
    HotelsModule,
    P2Module,
    MongooseModule.forFeature([
      { name: Itinerary.name, schema: ItinerarySchema },
    ]),
  ],
  controllers: [ItinerariesController],
  providers: [ItinerariesService],
  exports: [ItinerariesService],
})
export class ItinerariesModule {}
