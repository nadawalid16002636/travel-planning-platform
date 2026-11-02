import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role, JwtUser } from './roles.js';

export const IS_PUBLIC = 'isPublic';
export const ROLES_KEY = 'roles';

/** Every endpoint requires login by default. Mark guest endpoints with @Public(). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restrict an endpoint to roles, e.g. @Roles(Role.ADMIN). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** The logged-in user from the JWT (undefined on a @Public endpoint without login). */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): JwtUser | undefined => ctx.switchToHttp().getRequest().user,
);
