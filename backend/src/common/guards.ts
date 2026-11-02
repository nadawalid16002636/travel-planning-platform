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

/** Global: reads the JWT from the httpOnly cookie. TODO P1: also reject suspended/deactivated accounts. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest();
    const token = req.cookies?.[AUTH_COOKIE];
    if (token) {
      try {
        req.user = this.jwt.verify<JwtUser>(token);
      } catch {
        if (!isPublic) throw new UnauthorizedException('Session expired, please log in again');
      }
    }
    if (!req.user && !isPublic) throw new UnauthorizedException('Login required');
    return true;
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
