// Owner: P1.
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [UsersModule],
  controllers: [AdminController],
})
export class AdminModule {}
