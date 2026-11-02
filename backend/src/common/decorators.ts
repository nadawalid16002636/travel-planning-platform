import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role, JwtUser } from './roles.js';

export const IS_PUBLIC = 'isPublic';
export const ROLES_KEY = 'roles';
export const ALLOW_PENDING_PASSWORD = 'allowPendingPassword';

/** Every endpoint requires login by default. Mark guest endpoints with @Public(). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restrict an endpoint to roles, e.g. @Roles(Role.ADMIN). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * ACC-07a, ACC-13: accounts with a temporary password can only reach endpoints marked with this
 * (me, change-password, logout) until they set a new password.
 */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD, true);

/** The logged-in user (undefined on a @Public endpoint without login). */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): JwtUser | undefined => ctx.switchToHttp().getRequest().user,
);
