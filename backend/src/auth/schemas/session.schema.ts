import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/**
 * ACC-06: one document per login. The refresh token is stored only as a SHA-256 hash.
 * Revoked on logout, password change and admin password reset.
 */
@Schema({ timestamps: true })
export class Session {
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId: Types.ObjectId;
  @Prop({ required: true, unique: true }) refreshTokenHash: string;
  @Prop({ required: true }) lastActivityAt: Date;
  @Prop({ required: true }) expiresAt: Date;
  @Prop() revokedAt?: Date;
  @Prop() userAgent?: string;
  @Prop() ip?: string;
}

export const SessionSchema = SchemaFactory.createForClass(Session);
// MongoDB deletes sessions a day after they can no longer be used
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 3600 });
