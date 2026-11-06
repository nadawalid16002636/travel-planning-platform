import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HotelDocument = HydratedDocument<Hotel>;

export enum HotelStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Schema({ timestamps: true })
export class Hotel {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  city: string;

  @Prop({ required: true, trim: true })
  country: string;

  @Prop({ required: true, trim: true })
  address: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ min: 1, max: 5 })
  starRating: number;

  @Prop({ type: [String], default: [] })
  amenities: string[];

  @Prop({
    type: String,
    enum: HotelStatus,
    default: HotelStatus.ACTIVE,
    index: true,
  })
  status: HotelStatus;

  @Prop({
    type: {
      checkInTime: { type: String, default: '15:00' },
      checkOutTime: { type: String, default: '11:00' },
      cancellationDeadlineHours: { type: Number, default: 24, min: 0 },
      cancellationRefundPercent: {
        type: Number,
        default: 100,
        min: 0,
        max: 100,
      },
    },
    default: () => ({}),
  })
  policy: {
    checkInTime: string;
    checkOutTime: string;
    cancellationDeadlineHours: number;
    cancellationRefundPercent: number;
  };

  @Prop({ default: 0, min: 0 })
  averageReviewRating: number;

  @Prop({ default: 0, min: 0 })
  reviewCount: number;
}

export const HotelSchema = SchemaFactory.createForClass(Hotel);
