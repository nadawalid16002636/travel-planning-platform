import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export const REPORT_TARGETS = ['post', 'comment', 'review', 'itinerary'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_STATUSES = ['open', 'dismissed', 'hidden', 'deleted'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

@Schema({ timestamps: true })
export class Report {
  @Prop({ type: String, required: true, index: true })
  reporterId: string;

  @Prop({ required: true, enum: REPORT_TARGETS, type: String })
  targetType: ReportTarget;

  @Prop({ required: true })
  targetId: string;

  @Prop({ required: true, trim: true, maxlength: 500 })
  reason: string;

  @Prop({ required: true, enum: REPORT_STATUSES, type: String, default: 'open', index: true })
  status: ReportStatus;

  @Prop()
  resolvedBy?: string;

  @Prop({ type: Date })
  resolvedAt?: Date;
}

export type ReportDocument = HydratedDocument<Report>;
export const ReportSchema = SchemaFactory.createForClass(Report);
ReportSchema.index({ reporterId: 1, targetType: 1, targetId: 1 }, { unique: true });

/** GEN-10: hide/delete state for content P5 has not modelled yet, and for reviews. */
@Schema({ timestamps: true })
export class ContentModeration {
  @Prop({ required: true, enum: REPORT_TARGETS, type: String })
  targetType: ReportTarget;

  @Prop({ required: true })
  targetId: string;

  @Prop({ required: true, enum: ['hidden', 'deleted'], type: String })
  state: 'hidden' | 'deleted';

  @Prop({ required: true })
  actorId: string;
}

export type ContentModerationDocument = HydratedDocument<ContentModeration>;
export const ContentModerationSchema = SchemaFactory.createForClass(ContentModeration);
ContentModerationSchema.index({ targetType: 1, targetId: 1 }, { unique: true });
