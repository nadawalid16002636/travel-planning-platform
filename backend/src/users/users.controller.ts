import { Body, Controller, Delete, Get, HttpCode, Patch, Res, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators.js';
import { AUTH_COOKIE, type JwtUser } from '../common/roles.js';
import { UsersService } from './users.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { DeactivateAccountDto } from './dto/deactivate-account.dto.js';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'ACC-11: view my profile' })
  async me(@CurrentUser() user: JwtUser) {
    return this.users.toPublic(await this.users.findById(user.sub));
  }

  @Patch('me')
  @ApiOperation({ summary: 'ACC-09: update my profile' })
  async update(@CurrentUser() user: JwtUser, @Body() dto: UpdateProfileDto) {
    return this.users.toPublic(await this.users.updateProfile(user.sub, dto));
  }

  @Delete('me')
  @HttpCode(200)
  @ApiOperation({ summary: 'ACC-12: deactivate my account (requires current password)' })
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
    res.clearCookie(AUTH_COOKIE, { path: '/' });
    return { message: 'Account deactivated' };
  }
}
