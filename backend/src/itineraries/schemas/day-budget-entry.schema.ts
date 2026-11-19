import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export enum DayBudgetCategory {
  FOOD = 'food',
  ACCOMMODATION = 'accommodation',
  LOCAL_TRANSPORTATION = 'local_transportation',
  ACTIVITIES = 'activities',
}

@Schema()
export class DayBudgetEntry {
  @Prop({ type: String, required: true, enum: Object.values(DayBudgetCategory) })
  category: DayBudgetCategory;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({
    required: true,
    uppercase: true,
    trim: true,
    minlength: 3,
    maxlength: 3,
    match: /^[A-Z]{3}$/,
  })
  currency: string;

  @Prop()
  description?: string;
}

export const DayBudgetEntrySchema =
  SchemaFactory.createForClass(DayBudgetEntry);
