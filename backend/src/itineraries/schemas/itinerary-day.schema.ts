
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, SchemaTypes } from 'mongoose';
import {
  ItineraryActivity,
  ItineraryActivitySchema,
} from './itinerary-activity.schema.js';
import {
  DayBudgetEntry,
  DayBudgetEntrySchema,
} from './day-budget-entry.schema.js';
import {
  IntercityTransportEntry,
  IntercityTransportEntrySchema,
} from './intercity-transport-entry.schema.js';

@Schema()
export class ItineraryBookingAssociation {
  _id?: Types.ObjectId;

  @Prop({ type: String, enum: ['flight'], required: true })
  type: 'flight';

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  bookingId: Types.ObjectId;
}

export const ItineraryBookingAssociationSchema =
  SchemaFactory.createForClass(ItineraryBookingAssociation);

@Schema()
export class ItineraryDay {
  _id?: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  order: number;

  @Prop({ required: true })
  date: Date;

  // Optional in storage for legacy documents; all new writes require cityId.
  @Prop()
  cityId?: string;

  /** @deprecated Legacy field retained for existing documents; not accepted on new writes. */
  @Prop()
  city?: string;

  @Prop()
  notes?: string;

  @Prop({ type: [ItineraryActivitySchema], default: [] })
  activities: ItineraryActivity[];

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ type: [DayBudgetEntrySchema], default: [] })
  budgetEntries: DayBudgetEntry[];

  @Prop({ type: [IntercityTransportEntrySchema], default: [] })
  transportEntries: IntercityTransportEntry[];

  @Prop({ type: [ItineraryBookingAssociationSchema], default: [] })
  bookingAssociations: ItineraryBookingAssociation[];
}

export const ItineraryDaySchema =
  SchemaFactory.createForClass(ItineraryDay);
