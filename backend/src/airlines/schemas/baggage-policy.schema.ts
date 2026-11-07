import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class BaggagePolicy {
  @Prop({ required: true, min: 0 })
  checkedBaggageKg: number;

  @Prop({ required: true, min: 0 })
  cabinBaggageKg: number;

  @Prop({ required: true, min: 1 })
  extraBagPriceMinor: number;

  @Prop({ required: true, min: 0 })
  maxExtraBagsPerPassenger: number;

  @Prop({ required: true, default: 'USD' })
  currency: string;
}

export const BaggagePolicySchema = SchemaFactory.createForClass(BaggagePolicy);
