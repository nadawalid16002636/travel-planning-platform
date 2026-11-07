import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_PENDING_PASSWORD, IS_PUBLIC, ROLES_KEY } from './decorators.js';
import { JwtUser, Role } from './roles.js';
import { UsersService } from '../users/users.service.js';
import { AccountStatus } from '../users/schemas/user.schema.js';
import { SessionsService } from '../auth/sessions.service.js';

/**
 * Global: authenticates every request from the httpOnly cookies (ACC-06, ACC-19), then re-checks
 * the account, so suspension, deactivation and role changes take effect immediately.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const meta = <T>(key: string) =>
      this.reflector.getAllAndOverride<T>(key, [ctx.getHandler(), ctx.getClass()]);
    const isPublic = meta<boolean>(IS_PUBLIC);
    const http = ctx.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    try {
      const auth = await this.sessions.authenticate(req, res);
      if (auth) req.user = await this.resolveUser(auth.userId, auth.sessionId);
    } catch (err) {
      if (!isPublic) throw err;
      req.user = undefined; // public endpoints simply treat the caller as a guest
    }

    if (!req.user) {
      if (isPublic) return true;
      throw new UnauthorizedException('Login required');
    }

    if (!isPublic && req.user.mustChangePassword && !meta<boolean>(ALLOW_PENDING_PASSWORD)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must set a new password before continuing',
      });
    }
    return true;
  }

  private async resolveUser(userId: string, sessionId: string) {
    const account = await this.users.findAuthState(userId);
    if (!account) throw new UnauthorizedException('Account not found');
    if (account.status === AccountStatus.SUSPENDED) throw new ForbiddenException('This account is suspended');
    if (account.status === AccountStatus.DEACTIVATED) throw new UnauthorizedException('This account is deactivated');
    // role and provider always come from the database, never from the token
    return {
      sub: userId,
      sid: sessionId,
      role: account.role,
      providerId: account.providerId?.toString(),
      mustChangePassword: account.mustChangePassword,
    };
  }
}

/** Global: enforces @Roles(). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles?.length) return true;
    const user: JwtUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException('Not allowed for your role');
    return true;
  }
}

/**
 * ACC-11: ownership check for private resources (bookings, itineraries, drafts).
 * Respond 404 instead if you prefer not to reveal that the resource exists.
 */
export function assertOwner(ownerId: unknown, user: JwtUser): void {
  if (String(ownerId) !== user.sub) throw new ForbiddenException('You do not own this resource');
}

/** Moderators may only manage their assigned airline or hotel. */
export function assertProvider(providerId: unknown, user: JwtUser): void {
  if (user.role === Role.ADMIN) return;
  if (!user.providerId || String(providerId) !== user.providerId) {
    throw new ForbiddenException('You can only manage your assigned provider');
  }
}
