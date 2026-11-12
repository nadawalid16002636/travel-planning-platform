import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Review {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Hotel', required: true, index: true })
  hotelId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'HotelBooking',
    required: true,
    unique: true,
  })
  bookingId: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ trim: true, maxlength: 1000 })
  comment?: string;

  @Prop({ trim: true, maxlength: 2000 })
  reply?: string;

  /** GEN-10: hidden reviews stay visible to the author and to admins. */
  @Prop({ default: false, index: true })
  hidden: boolean;
}

export type ReviewDocument = HydratedDocument<Review>;
export const ReviewSchema = SchemaFactory.createForClass(Review);
ReviewSchema.index({ hotelId: 1, createdAt: -1 });
