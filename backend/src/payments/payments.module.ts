// Owner: P4. Global, so flight/hotel booking modules can inject PaymentsService.
import { Global, Module } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';

@Global()
@Module({ providers: [PaymentsService], exports: [PaymentsService] })
export class PaymentsModule {}
