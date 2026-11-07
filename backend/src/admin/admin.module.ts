// Owner: P1.
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { AdminController } from './admin.controller.js';
import { ProvidersService } from './providers.service.js';
import { AdminBookingsService } from './admin-bookings.service.js';

@Module({
  imports: [UsersModule],
  controllers: [AdminController],
  providers: [ProvidersService, AdminBookingsService],
})
export class AdminModule {}
