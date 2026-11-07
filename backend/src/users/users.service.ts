import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter } from 'mongoose';
import bcrypt from 'bcryptjs';
import { Role } from '../common/roles.js';
import { AccountStatus, User, UserDocument } from './schemas/user.schema.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ReferenceService } from '../reference/reference.service.js';

const BCRYPT_ROUNDS = 12;

/** Returns a reason string if deactivation must be blocked, or null. */
export type DeactivationCheck = (userId: string) => Promise<string | null>;

@Injectable()
export class UsersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersService.name);
  private readonly deactivationChecks: DeactivationCheck[] = [];

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly config: ConfigService,
    private readonly reference: ReferenceService,
  ) {}

  /** Administrator accounts are seeded, never self-registered. */
  async onApplicationBootstrap() {
    const email = this.config.get<string>('ADMIN_EMAIL');
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email || !password) return;
    if (await this.userModel.exists({ role: Role.ADMIN })) return;
    await this.userModel.create({
      email,
      passwordHash: await this.hashPassword(password),
      firstName: 'Platform',
      lastName: 'Admin',
      role: Role.ADMIN,
    });
    this.logger.log(`Seeded administrator account ${email}`);
  }

  hashPassword(plain: string) {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
  }

  checkPassword(plain: string, hash: string) {
    return bcrypt.compare(plain, hash);
  }

  async create(data: Partial<User> & { password: string }): Promise<UserDocument> {
    const email = data.email!.toLowerCase().trim();
    if (await this.userModel.exists({ email })) throw new ConflictException('Email is already registered');
    const { password, ...rest } = data;
    return this.userModel.create({ ...rest, email, passwordHash: await this.hashPassword(password) });
  }

  /** Includes the private auth fields; only for auth flows. */
  findByEmailWithSecrets(email: string) {
    return this.userModel
      .findOne({ email: email.toLowerCase().trim() })
      .select('+passwordHash +failedLoginAttempts +lockUntil');
  }

  findByIdWithSecrets(id: string) {
    return this.userModel.findById(id).select('+passwordHash +failedLoginAttempts +lockUntil');
  }

  /** Light lookup used by the AuthGuard on every request. */
  findAuthState(id: string) {
    return this.userModel
      .findById(id)
      .select('role status providerId mustChangePassword')
      .lean();
  }

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<UserDocument> {
    const user = await this.findById(id);
    const { preferences, ...rest } = dto;
    // ACC-09: the preferred currency must be one of the supported (seeded) currencies
    if (preferences?.currency && !(await this.reference.isSupportedCurrency(preferences.currency))) {
      throw new BadRequestException(`Unsupported currency: ${preferences.currency}`);
    }
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) user.set(key, value);
    }
    for (const [key, value] of Object.entries(preferences ?? {})) {
      if (value !== undefined) user.set(`preferences.${key}`, value);
    }
    return user.save();
  }

  async setPassword(user: UserDocument, plain: string, mustChange = false) {
    user.passwordHash = await this.hashPassword(plain);
    // callers revoke the affected sessions (SessionsService.revokeAllForUser)
    user.passwordChangedAt = new Date();
    user.mustChangePassword = mustChange;
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();
  }

  /**
   * ACC-12: booking modules register a check in onModuleInit(), e.g.
   *   this.users.registerDeactivationCheck(async (userId) =>
   *     (await this.hasUpcomingConfirmed(userId)) ? 'You have upcoming confirmed flight bookings' : null);
   */
  registerDeactivationCheck(check: DeactivationCheck) {
    this.deactivationChecks.push(check);
  }

  async deactivate(id: string) {
    for (const check of this.deactivationChecks) {
      const reason = await check(id);
      if (reason) throw new BadRequestException(`Account cannot be deactivated: ${reason}`);
    }
    const user = await this.findById(id);
    user.status = AccountStatus.DEACTIVATED;
    await user.save();
  }

  async list(filter: QueryFilter<User>, page: number, limit: number) {
    const [data, total] = await Promise.all([
      this.userModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      this.userModel.countDocuments(filter),
    ]);
    return { data: data.map((u) => this.toPublic(u)), total };
  }

  async setStatus(id: string, status: AccountStatus, reason?: string) {
    const user = await this.findById(id);
    if (user.role === Role.ADMIN) throw new BadRequestException('Administrator accounts cannot be suspended');
    if (user.status === status) throw new BadRequestException(`Account is already ${status}`);
    user.status = status;
    user.suspendedReason = status === AccountStatus.SUSPENDED ? reason : undefined;
    await user.save();
    return this.toPublic(user);
  }

  /** Name + email for lists that show who a record belongs to (e.g. ACC-17). */
  async basicInfo(ids: string[]) {
    if (!ids.length) return [];
    const docs = await this.userModel.find({ _id: { $in: ids } }).select('firstName lastName email').lean();
    return docs.map((u) => ({
      id: String(u._id),
      name: `${u.firstName} ${u.lastName}`.trim(),
      email: u.email,
    }));
  }

  /** Moderators linked to a provider (ACC-15 notifications). */
  async moderatorIdsFor(providerId: string) {
    return (await this.userModel.distinct('_id', { providerId })).map(String);
  }

  /** The only shape of a user that ever leaves the API. */
  toPublic(user: UserDocument) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      nationality: user.nationality,
      dateOfBirth: user.dateOfBirth,
      preferences: user.preferences,
      role: user.role,
      status: user.status,
      providerType: user.providerType,
      providerId: user.providerId?.toString(),
      mustChangePassword: user.mustChangePassword,
      name: `${user.firstName} ${user.lastName}`.trim(),
      createdAt: (user as any).createdAt,
    };
  }
}
