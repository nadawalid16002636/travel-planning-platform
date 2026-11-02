// Owner: P1. Global, so any module can inject AuditService without importing this module.
import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditService } from './audit.service.js';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema.js';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: AuditLog.name, schema: AuditLogSchema }])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
