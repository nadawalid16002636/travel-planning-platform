import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/** GEN-07: append-only record of important admin and moderator actions. */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog {
  @Prop({ type: Types.ObjectId, required: true, index: true }) actorId: Types.ObjectId;
  @Prop({ required: true, index: true }) action: string;
  @Prop({ required: true }) targetType: string;
  @Prop({ required: true, index: true }) targetId: string;
  @Prop({ type: Object }) meta?: Record<string, unknown>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
