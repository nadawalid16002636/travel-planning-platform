// Owner: P4. Global, so any module can inject UploadsService.
import { Global, Module } from '@nestjs/common';
import { UploadsService } from './uploads.service.js';

@Global()
@Module({ providers: [UploadsService], exports: [UploadsService] })
export class UploadsModule {}
