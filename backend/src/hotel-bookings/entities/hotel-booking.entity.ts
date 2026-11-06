import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum HotelBookingStatus {
  PENDING_PAYMENT = 'pending_payment',
  CONFIRMED = 'confirmed',
  CANCELLATION_PENDING = 'cancellation_pending',
  CANCELLED = 'cancelled',
  PAYMENT_FAILED = 'payment_failed',
  EXPIRED = 'expired',
}

@Schema({ _id: false })
export class BookedRoom {
  @Prop({ type: Types.ObjectId, ref: 'HotelRoom', required: true })
  roomId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  roomName: string;

  @Prop({ required: true, min: 1 })
  guestCount: number;

  @Prop({ required: true, min: 0 })
  pricePerNight: number;

  @Prop({ required: true, uppercase: true })
  currency: string;
}

@Schema({ _id: false })
export class HotelPolicySnapshot {
  @Prop({ required: true })
  checkInTime: string;

  @Prop({ required: true })
  checkOutTime: string;

  @Prop({ required: true, min: 0 })
  cancellationDeadlineHours: number;

  @Prop({ required: true, min: 0, max: 100 })
  cancellationRefundPercent: number;
}

@Schema({ timestamps: true })
export class HotelBooking {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Hotel', required: true, index: true })
  hotelId: Types.ObjectId;

  @Prop({ type: [BookedRoom], required: true })
  rooms: BookedRoom[];

  @Prop({ type: Date, required: true, index: true })
  checkIn: Date;

  @Prop({ type: Date, required: true, index: true })
  checkOut: Date;

  @Prop({ required: true, min: 1 })
  nights: number;

  @Prop({ required: true, min: 0 })
  totalAmount: number;

  @Prop({ required: true, uppercase: true })
  currency: string;

  @Prop({ type: HotelPolicySnapshot, required: true })
  policySnapshot: HotelPolicySnapshot;

  @Prop({ type: Date, required: true })
  policyAcceptedAt: Date;

  @Prop({ type: String, enum: HotelBookingStatus, required: true, index: true })
  status: HotelBookingStatus;

  @Prop({ type: Date, required: true, index: true })
  holdExpiresAt: Date;

  @Prop({ trim: true, unique: true, sparse: true })
  reference?: string;

  @Prop({ trim: true })
  paymentId?: string;

  @Prop({ trim: true })
  refundId?: string;

  @Prop({ type: Date })
  cancelledAt?: Date;
}

export type HotelBookingDocument = HydratedDocument<HotelBooking>;
export const HotelBookingSchema = SchemaFactory.createForClass(HotelBooking);
HotelBookingSchema.index({ userId: 1, createdAt: -1 });
HotelBookingSchema.index({ hotelId: 1, checkIn: 1, checkOut: 1 });
