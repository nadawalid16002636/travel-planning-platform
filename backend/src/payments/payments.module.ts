import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { P2Module } from '../p2/p2.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { BookingPoliciesController, PaymentsController, RefundsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { P4Worker } from './p4.worker.js';
import { Payment, PaymentSchema, StripeEvent, StripeEventSchema } from './schemas/payment.schema.js';
import { Refund, RefundSchema } from './schemas/refund.schema.js';
import { StripeGateway } from './stripe.gateway.js';

@Global()
@Module({
  imports: [
    NotificationsModule,
    P2Module,
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Refund.name, schema: RefundSchema },
      { name: StripeEvent.name, schema: StripeEventSchema },
    ]),
  ],
  controllers: [PaymentsController, BookingPoliciesController, RefundsController],
  providers: [PaymentsService, StripeGateway, P4Worker],
  exports: [PaymentsService],
})
export class PaymentsModule {}
