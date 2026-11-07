import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AirlinesModule } from './airlines/airlines.module';
import { P2Module } from './p2/p2.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(process.env.MONGODB_URI as string),
    AirlinesModule,
    P2Module,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
