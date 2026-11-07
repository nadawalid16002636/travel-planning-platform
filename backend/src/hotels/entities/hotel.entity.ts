import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HotelDocument = HydratedDocument<Hotel>;

export enum HotelStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Schema({ _id: false })
export class HotelCancellationTier {
  @Prop({ required: true, min: 0 })
  daysBeforeCheckIn: number;

  @Prop({ required: true, min: 0, max: 100 })
  refundPercent: number;
}

const HotelCancellationTierSchema =
  SchemaFactory.createForClass(HotelCancellationTier);

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

  @Prop({ type: [String], default: [] })
  photos: string[];

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
      cancellationTiers: { type: [HotelCancellationTierSchema], default: [] },
    },
    default: () => ({}),
  })
  policy: {
    checkInTime: string;
    checkOutTime: string;
    cancellationTiers: HotelCancellationTier[];
  };

  @Prop({ default: 0, min: 0 })
  averageReviewRating: number;

  @Prop({ default: 0, min: 0 })
  reviewCount: number;
}

export const HotelSchema = SchemaFactory.createForClass(Hotel);
