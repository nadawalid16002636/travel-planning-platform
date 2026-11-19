
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class ItineraryBudget {
  @Prop({
    required: true,
    enum: ['food', 'accommodation', 'local_transportation', 'activities', 'intercity_transportation'],
  })
  category: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, uppercase: true, minlength: 3, maxlength: 3 })
  currency: string;

  @Prop()
  description?: string;

  @Prop()
  date?: Date;
}

export const ItineraryBudgetSchema =
  SchemaFactory.createForClass(ItineraryBudget);
