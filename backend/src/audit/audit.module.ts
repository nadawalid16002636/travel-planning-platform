// Owner: P1. Global, so any module can inject AuditService without importing this module.
import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
