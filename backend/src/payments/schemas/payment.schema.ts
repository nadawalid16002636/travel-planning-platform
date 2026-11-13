import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled';

/** PAY-01: only the Stripe payment id, amount, currency and status. No card data. */
@Schema({ timestamps: true })
export class Payment {
  @Prop({ required: true, enum: ['flight', 'hotel'], type: String, index: true })
  bookingType: 'flight' | 'hotel';

  @Prop({ required: true, index: true })
  bookingId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, unique: true })
  stripePaymentIntentId: string;

  @Prop({ required: true, min: 1 })
  amount: number;

  /** Currency stored on the booking, unchanged. PAY-04. */
  @Prop({ required: true })
  currency: string;

  @Prop({ required: true, enum: ['pending', 'succeeded', 'failed', 'cancelled'], type: String, index: true })
  status: PaymentStatus;

  @Prop({ type: Date, required: true, index: true })
  expiresAt: Date;
}

export type PaymentDocument = HydratedDocument<Payment>;
export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.index({ bookingType: 1, bookingId: 1 }, { unique: true });

@Schema({ timestamps: true })
export class StripeEvent {
  @Prop({ required: true, unique: true })
  eventId: string;

  @Prop({ required: true })
  type: string;
}

export type StripeEventDocument = HydratedDocument<StripeEvent>;
export const StripeEventSchema = SchemaFactory.createForClass(StripeEvent);
