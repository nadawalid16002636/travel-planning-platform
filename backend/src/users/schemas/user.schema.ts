import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Role } from '../../common/roles.js';

export enum AccountStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended', // by an admin (ACC-15)
  DEACTIVATED = 'deactivated', // by the user (ACC-12)
}

export enum ProviderType {
  AIRLINE = 'airline',
  HOTEL = 'hotel',
}

@Schema({ _id: false })
export class Preferences {
  @Prop({ default: 'USD', uppercase: true, trim: true }) currency: string;
  @Prop({ default: 'en', trim: true }) language: string;
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true }) email: string;
  @Prop({ required: true, select: false }) passwordHash: string;

  @Prop({ required: true, trim: true }) firstName: string;
  @Prop({ required: true, trim: true }) lastName: string;
  @Prop({ trim: true }) phone?: string;
  @Prop({ trim: true }) nationality?: string;
  @Prop() dateOfBirth?: Date;
  @Prop({ type: Preferences, default: () => ({}) }) preferences: Preferences;

  @Prop({ type: String, enum: Role, default: Role.USER, index: true }) role: Role;
  @Prop({ type: String, enum: AccountStatus, default: AccountStatus.ACTIVE, index: true })
  status: AccountStatus;
  @Prop() suspendedReason?: string;

  /** Moderator assignment: exactly one airline or hotel (ACC-13). */
  @Prop({ type: String, enum: ProviderType }) providerType?: ProviderType;
  @Prop({ type: Types.ObjectId }) providerId?: Types.ObjectId;

  // Lockout + session invalidation (ACC-05, ACC-07a, ACC-08)
  @Prop({ default: 0, select: false }) failedLoginAttempts: number;
  @Prop({ select: false }) lockUntil?: Date;
  @Prop() passwordChangedAt?: Date;
  @Prop({ default: false }) mustChangePassword: boolean;

  /** ACC-01: registration requires accepting the terms and privacy policy. */
  @Prop() termsAcceptedAt?: Date;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
