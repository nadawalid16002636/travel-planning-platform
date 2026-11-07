import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { BaggagePolicy, BaggagePolicySchema } from './baggage-policy.schema.js';
import {
  CancellationPolicy,
  CancellationPolicySchema,
} from './cancellation-policy.schema.js';

export type AirlineDocument = HydratedDocument<Airline>;

@Schema({ timestamps: true })
export class Airline {
  @Prop({ required: true, trim: true, unique: true })
  name: string;

  @Prop({
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  })
  code: string;

  @Prop({ required: true })
  country: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '' }) logo: string;
  @Prop({ default: true }) active: boolean;

  @Prop({ type: BaggagePolicySchema, required: false })
  baggagePolicy?: BaggagePolicy;

  @Prop({ type: CancellationPolicySchema, required: false })
  cancellationPolicy?: CancellationPolicy;
}

export const AirlineSchema = SchemaFactory.createForClass(Airline);
