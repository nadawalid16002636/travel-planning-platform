import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class Notification {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  title: string;

  @Prop({ type: Object, default: {} })
  payload: Record<string, unknown>;

  @Prop({ default: false, index: true })
  read: boolean;

  @Prop({ type: Date })
  readAt?: Date;
}

export type NotificationDocument = HydratedDocument<Notification>;
export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, createdAt: -1 });
