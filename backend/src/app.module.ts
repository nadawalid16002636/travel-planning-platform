import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthGuard, RolesGuard } from './common/guards.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { AUTH_RULES } from './common/auth.config.js';
import { HealthController } from './health.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { ReferenceModule } from './reference/reference.module.js';
import { UsersModule } from './users/users.module.js';
import { AdminModule } from './admin/admin.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AirlinesModule } from './airlines/airlines.module.js';
import { FlightsModule } from './flights/flights.module.js';
import { FlightBookingsModule } from './flight-bookings/flight-bookings.module.js';
import { HotelsModule } from './hotels/hotels.module.js';
import { HotelBookingsModule } from './hotel-bookings/hotel-bookings.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { ItinerariesModule } from './itineraries/itineraries.module.js';
import { PostsModule } from './posts/posts.module.js';
import { FxModule } from './fx/fx.module.js';

// Only the team lead edits this file. Send P1 your import line if you add a module.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ uri: config.getOrThrow<string>('MONGODB_URI') }),
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', AUTH_RULES.accessTokenTtl) },
      }),
    }),
    ScheduleModule.forRoot(),
    ReferenceModule,
    AuthModule,
    UsersModule,
    AdminModule,
    AuditModule,
    AirlinesModule,
    FlightsModule,
    FlightBookingsModule,
    HotelsModule,
    HotelBookingsModule,
    ReviewsModule,
    PaymentsModule,
    NotificationsModule,
    UploadsModule,
    ReportsModule,
    ItinerariesModule,
    PostsModule,
    FxModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
