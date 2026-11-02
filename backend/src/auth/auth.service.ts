import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AUTH_RULES } from '../common/auth.config.js';
import { JwtUser, Role } from '../common/roles.js';
import { UsersService } from '../users/users.service.js';
import { AccountStatus } from '../users/schemas/user.schema.js';
import { SessionsService } from './sessions.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
  ) {}

  /** ACC-01 */
  async register(dto: RegisterDto) {
    const { acceptTerms, ...data } = dto;
    const user = await this.users.create({ ...data, role: Role.USER, termsAcceptedAt: new Date() });
    return this.users.toPublic(user);
  }

  /** ACC-04, ACC-05. Returns the user; the controller starts the session (cookies). */
  async verifyCredentials(dto: LoginDto) {
    const user = await this.users.findByEmailWithSecrets(dto.email);
    // same message for unknown email and wrong password, so emails cannot be probed
    const invalid = new UnauthorizedException('Invalid email or password');
    if (!user) throw invalid;

    if (user.lockUntil && user.lockUntil > new Date()) {
      const minutes = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
      throw new ForbiddenException(
        `Account locked after ${AUTH_RULES.maxFailedLogins} failed attempts. Try again in ${minutes} minute(s)`,
      );
    }

    if (!(await this.users.checkPassword(dto.password, user.passwordHash))) {
      user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
      if (user.failedLoginAttempts >= AUTH_RULES.maxFailedLogins) {
        user.lockUntil = new Date(Date.now() + AUTH_RULES.lockoutMinutes * 60000);
        user.failedLoginAttempts = 0;
      }
      await user.save();
      throw invalid;
    }

    if (user.status === AccountStatus.SUSPENDED) throw new ForbiddenException('This account is suspended');
    if (user.status === AccountStatus.DEACTIVATED) throw new ForbiddenException('This account is deactivated');

    user.failedLoginAttempts = 0; // a successful login resets the counter
    user.lockUntil = undefined;
    await user.save();
    return user;
  }

  /** ACC-08 (also completes ACC-07a/ACC-13 temporary passwords). Other sessions are signed out. */
  async changePassword(current: JwtUser, dto: ChangePasswordDto) {
    const user = await this.users.findByIdWithSecrets(current.sub);
    if (!user) throw new UnauthorizedException();
    if (!(await this.users.checkPassword(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different from the current password');
    }
    await this.users.setPassword(user, dto.newPassword);
    await this.sessions.revokeAllForUser(current.sub, current.sid);
  }
}
