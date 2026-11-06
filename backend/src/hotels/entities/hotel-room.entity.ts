import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum RoomReservationStatus {
  PENDING_PAYMENT = 'pending_payment',
  CONFIRMED = 'confirmed',
}

@Schema({ _id: false })
export class RoomReservation {
  @Prop({ type: Types.ObjectId, required: true })
  bookingId: Types.ObjectId;

  @Prop({ type: Date, required: true })
  checkIn: Date;

  @Prop({ type: Date, required: true })
  checkOut: Date;

  @Prop({
    type: String,
    enum: RoomReservationStatus,
    required: true,
  })
  status: RoomReservationStatus;

  @Prop({ type: Date, required: true })
  expiresAt: Date;
}

const RoomReservationSchema = SchemaFactory.createForClass(RoomReservation);

@Schema({ timestamps: true })
export class HotelRoom {
  @Prop({ type: Types.ObjectId, ref: 'Hotel', required: true, index: true })
  hotelId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, min: 1 })
  maxOccupancy: number;

  @Prop({ required: true, min: 1 })
  pricePerNight: number;

  @Prop({
    required: true,
    uppercase: true,
    trim: true,
    minlength: 3,
    maxlength: 3,
  })
  currency: string;

  @Prop({ type: [String], default: [] })
  amenities: string[];

  @Prop({ type: [String], default: [] })
  blockedDates: string[];

  @Prop({ type: [RoomReservationSchema], default: [] })
  reservations: RoomReservation[];

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export type HotelRoomDocument = HydratedDocument<HotelRoom>;
export const HotelRoomSchema = SchemaFactory.createForClass(HotelRoom);
HotelRoomSchema.index({ hotelId: 1, isActive: 1 });
