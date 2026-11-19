
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class ItineraryActivityCost {
  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, uppercase: true, minlength: 3, maxlength: 3 })
  currency: string;
}

export const ItineraryActivityCostSchema =
  SchemaFactory.createForClass(ItineraryActivityCost);

@Schema()
export class ItineraryActivity {
  _id?: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop()
  location?: string;

  @Prop()
  startTime?: string;

  @Prop()
  endTime?: string;

  @Prop({ type: ItineraryActivityCostSchema })
  cost?: ItineraryActivityCost;

  @Prop({ type: [String], default: [] })
  images: string[];
}

export const ItineraryActivitySchema =
  SchemaFactory.createForClass(ItineraryActivity);
