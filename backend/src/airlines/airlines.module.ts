import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AirlinesController } from './airlines.controller.js';
import { AirlinesService } from './airlines.service.js';
import { Airline, AirlineSchema } from './schemas/airline.schema.js';
import { P2AccessModule } from '../p2/access.js';

@Module({
  imports: [
    P2AccessModule,
    MongooseModule.forFeature([{ name: Airline.name, schema: AirlineSchema }]),
  ],
  controllers: [AirlinesController],
  providers: [AirlinesService],
})
export class AirlinesModule {}
