import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Patch, Res } from '@nestjs/common';
import { SessionsService } from '../auth/sessions.service.js';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiErrors, CurrentUser, Roles } from '../common/decorators.js';
import { Role, type JwtUser } from '../common/roles.js';
import { UsersService } from './users.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { DeactivateAccountDto } from './dto/deactivate-account.dto.js';

@ApiTags('Users')
@ApiCookieAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'ACC-09: view my profile' })
  @ApiErrors(401, 403)
  async me(@CurrentUser() user: JwtUser) {
    return this.users.toPublic(await this.users.findById(user.sub));
  }

  @Patch('me')
  @ApiOperation({ summary: 'ACC-09: update my profile (name, phone, preferred currency)' })
  @ApiErrors([400, 'Invalid field or unsupported currency'], 401, 403)
  async update(@CurrentUser() user: JwtUser, @Body() dto: UpdateProfileDto) {
    return this.users.toPublic(await this.users.updateProfile(user.sub, dto));
  }

  @Delete('me')
  @HttpCode(200)
  @Roles(Role.USER) // ACC-12 is for registered users; admins and moderators are managed by an admin
  @ApiOperation({ summary: 'ACC-12: deactivate my account (confirm with password; blocked with upcoming confirmed bookings)' })
  @ApiErrors([400, 'Password is incorrect, or upcoming confirmed bookings exist'], 401, [403, 'Only registered users'])
  async deactivate(
    @CurrentUser() user: JwtUser,
    @Body() dto: DeactivateAccountDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const doc = await this.users.findByIdWithSecrets(user.sub);
    if (!doc || !(await this.users.checkPassword(dto.password, doc.passwordHash))) {
      throw new BadRequestException('Password is incorrect');
    }
    await this.users.deactivate(user.sub);
    await this.sessions.revokeAllForUser(user.sub);
    this.sessions.clearCookies(res);
    return { message: 'Account deactivated' };
  }
}
