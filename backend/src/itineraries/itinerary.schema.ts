
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

import {
  ItineraryDay,
  ItineraryDaySchema,
} from './schemas/itinerary-day.schema.js';

import {
  ItineraryBudget,
  ItineraryBudgetSchema,
} from './schemas/itinerary-budget.schema.js';

export type ItineraryDocument = HydratedDocument<Itinerary>;

@Schema({ timestamps: true })
export class Itinerary {
  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  // Optional at schema level so legacy documents remain readable; new writes
  // require countryCodes in the DTO and are validated against ReferenceService.
  @Prop({ type: [String] })
  countryCodes?: string[];

  /** @deprecated Legacy field retained for existing documents; not accepted on new writes. */
  @Prop({ type: [String] })
  destinations?: string[];

  @Prop({ required: true })
  startDate: Date;

  /** @deprecated Legacy persisted value; schedule dates are derived from startDate and days. */
  @Prop({ select: false })
  endDate?: Date;

  @Prop({
    required: true,
    enum: ['private', 'public'],
    default: 'private',
  })
  visibility: string;

  // GEN-10: hidden by an admin; visible only to its author and admins
  @Prop({ type: Boolean, default: false })
  hidden?: boolean;

  @Prop({ default: 'draft', enum: ['draft', 'published'] })
  status: string;

  @Prop({ type: [ItineraryDaySchema], default: [] })
  days: ItineraryDay[];

  // Retained at the existing location to preserve saved budget entries.
  @Prop({ type: [ItineraryBudgetSchema], default: [] })
  budgetEntries: ItineraryBudget[];

  // Snapshot attribution keeps a clone credited even if its source is later removed.
  @Prop({ type: SchemaTypes.ObjectId })
  clonedFromItineraryId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId })
  clonedFromAuthorId?: Types.ObjectId;

  @Prop()
  clonedFromAuthorName?: string;
}

export const ItinerarySchema = SchemaFactory.createForClass(Itinerary);
ItinerarySchema.index({ visibility: 1, updatedAt: -1 });
ItinerarySchema.index({ visibility: 1, countryCodes: 1 });
ItinerarySchema.index({ visibility: 1, 'days.cityId': 1 });
