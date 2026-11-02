import { Body, Controller, Delete, Get, HttpCode, Patch, Res, UnauthorizedException } from '@nestjs/common';
import { SessionsService } from '../auth/sessions.service.js';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators.js';
import type { JwtUser } from '../common/roles.js';
import { UsersService } from './users.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { DeactivateAccountDto } from './dto/deactivate-account.dto.js';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'ACC-11: view my profile' })
  async me(@CurrentUser() user: JwtUser) {
    return this.users.toPublic(await this.users.findById(user.sub));
  }

  @Patch('me')
  @ApiOperation({ summary: 'ACC-09: update my profile (name, phone, preferred currency)' })
  async update(@CurrentUser() user: JwtUser, @Body() dto: UpdateProfileDto) {
    return this.users.toPublic(await this.users.updateProfile(user.sub, dto));
  }

  @Delete('me')
  @HttpCode(200)
  @ApiOperation({ summary: 'ACC-12: deactivate my account (confirm with password; blocked with upcoming confirmed bookings)' })
  async deactivate(
    @CurrentUser() user: JwtUser,
    @Body() dto: DeactivateAccountDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const doc = await this.users.findByIdWithSecrets(user.sub);
    if (!doc || !(await this.users.checkPassword(dto.password, doc.passwordHash))) {
      throw new UnauthorizedException('Password is incorrect');
    }
    await this.users.deactivate(user.sub);
    await this.sessions.revokeAllForUser(user.sub);
    this.sessions.clearCookies(res);
    return { message: 'Account deactivated' };
  }
}
