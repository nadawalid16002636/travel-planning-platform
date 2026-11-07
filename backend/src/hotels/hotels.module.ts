import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HotelsService } from './hotels.service.js';
import { HotelsController } from './hotels.controller.js';
import { Hotel, HotelSchema } from './entities/hotel.entity.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Hotel.name, schema: HotelSchema },
    ]),
  ],
  controllers: [HotelsController],
  providers: [HotelsService],
  exports: [MongooseModule],
})
export class HotelsModule {}
