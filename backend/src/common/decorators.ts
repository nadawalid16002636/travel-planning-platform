import { SetMetadata, applyDecorators, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
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

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Validation failed or a business rule was broken',
  401: 'Not logged in, or the session expired',
  403: 'Not allowed for your role, account suspended, or password change required',
  404: 'Not found',
  409: 'Conflict with existing data',
};

/**
 * Swagger: documents the error responses of an endpoint, e.g.
 *   @ApiErrors(400, 401, [404, 'User not found'])
 */
export const ApiErrors = (...responses: Array<number | [number, string]>) =>
  applyDecorators(
    ...responses.map((r) => {
      const [status, description] = Array.isArray(r) ? r : [r, ERROR_DESCRIPTIONS[r]];
      return ApiResponse({ status, description });
    }),
  );

/** The logged-in user (undefined on a @Public endpoint without login). */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): JwtUser | undefined => ctx.switchToHttp().getRequest().user,
);
