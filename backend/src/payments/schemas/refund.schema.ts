import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** PAY-03 status words, shown on booking details. */
export const REFUND_STATUSES = ['Pending', 'Refunded', 'Failed'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

@Schema({ timestamps: true })
export class Refund {
  @Prop({ required: true, enum: ['flight', 'hotel'], type: String, index: true })
  bookingType: 'flight' | 'hotel';

  @Prop({ required: true, index: true })
  bookingId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  paymentIntentId: string;

  @Prop({ required: true, unique: true })
  stripeRefundId: string;

  @Prop({ required: true, min: 1 })
  amount: number;

  @Prop({ required: true })
  currency: string;

  @Prop({ required: true, enum: REFUND_STATUSES, type: String, index: true })
  status: RefundStatus;
}

export type RefundDocument = HydratedDocument<Refund>;
export const RefundSchema = SchemaFactory.createForClass(Refund);
RefundSchema.index({ bookingType: 1, bookingId: 1 });
