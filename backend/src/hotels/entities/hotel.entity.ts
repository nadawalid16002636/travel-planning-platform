import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HotelDocument = HydratedDocument<Hotel>;

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
}

export const HotelSchema = SchemaFactory.createForClass(Hotel);
