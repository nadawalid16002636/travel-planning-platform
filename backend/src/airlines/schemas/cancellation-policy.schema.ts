import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
@Schema({ _id: false })
export class CancellationTier {
  @Prop({ required: true, min: 0 }) daysBeforeDeparture: number;
  @Prop({ required: true, min: 0, max: 100 }) refundPercent: number;
}
const TierSchema = SchemaFactory.createForClass(CancellationTier);
@Schema({ _id: false })
export class CancellationPolicy {
  @Prop({ type: [TierSchema], required: true }) tiers: CancellationTier[];
}
export const CancellationPolicySchema =
  SchemaFactory.createForClass(CancellationPolicy);
