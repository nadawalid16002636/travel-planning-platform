import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC, ROLES_KEY } from './decorators.js';
import { AUTH_COOKIE, JwtUser, Role } from './roles.js';
import { UsersService } from '../users/users.service.js';
import { AccountStatus } from '../users/schemas/user.schema.js';

/**
 * Global: reads the JWT from the httpOnly cookie, then re-checks the account on every request,
 * so suspension, deactivation, role changes and password changes take effect immediately.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly users: UsersService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest();
    const token = req.cookies?.[AUTH_COOKIE];

    if (token) {
      try {
        req.user = await this.resolveUser(token);
      } catch (err) {
        if (!isPublic) throw err;
      }
    }
    if (!req.user && !isPublic) throw new UnauthorizedException('Login required');
    return true;
  }

  private async resolveUser(token: string): Promise<JwtUser> {
    let payload: JwtUser & { iat: number };
    try {
      payload = this.jwt.verify(token);
    } catch {
      throw new UnauthorizedException('Session expired, please log in again');
    }
    const account = await this.users.findAuthState(payload.sub);
    if (!account) throw new UnauthorizedException('Account not found');
    if (account.status === AccountStatus.SUSPENDED) throw new ForbiddenException('This account is suspended');
    if (account.status === AccountStatus.DEACTIVATED) throw new UnauthorizedException('This account is deactivated');
    if (account.passwordChangedAt && payload.iat * 1000 < account.passwordChangedAt.getTime()) {
      throw new UnauthorizedException('Password was changed, please log in again');
    }
    // role and provider always come from the database, not from the token
    return { sub: payload.sub, role: account.role, providerId: account.providerId?.toString() };
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

/** Ownership check for private resources (bookings, itineraries, posts, comments). */
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
