import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { UPLOAD_PURPOSES, type UploadPurpose } from '../upload.rules.js';

@Schema({ timestamps: true })
export class Upload {
  @Prop({ required: true, unique: true })
  filename: string;

  @Prop({ required: true, enum: UPLOAD_PURPOSES, type: String, index: true })
  purpose: UploadPurpose;

  @Prop({ required: true, index: true })
  entityId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  mime: string;

  @Prop({ required: true, min: 1 })
  size: number;

  @Prop({ required: true })
  url: string;
}

export type UploadDocument = HydratedDocument<Upload>;
export const UploadSchema = SchemaFactory.createForClass(Upload);
UploadSchema.index({ purpose: 1, entityId: 1 });
