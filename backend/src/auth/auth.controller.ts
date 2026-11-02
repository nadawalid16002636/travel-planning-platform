import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AllowPendingPasswordChange, CurrentUser, Public } from '../common/decorators.js';
import type { JwtUser } from '../common/roles.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { SessionsService } from './sessions.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';

/** Tokens live only in httpOnly cookies; they never appear in a response body (ACC-19). */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'ACC-01: register a traveler account' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'ACC-04, ACC-05: log in (sets the access and refresh cookies)' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.verifyCredentials(dto);
    await this.sessions.start(user.id, req, res);
    return { user: this.users.toPublic(user) };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'ACC-06: log out (revokes the refresh token, clears cookies)' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revokeCurrent(req);
    this.sessions.clearCookies(res);
    return { message: 'Logged out' };
  }

  @Post('refresh')
  @HttpCode(200)
  @AllowPendingPasswordChange()
  @ApiOperation({ summary: 'ACC-06: renew the access cookie (also done automatically on any request)' })
  refresh() {
    return { message: 'Session active' };
  }

  @Get('me')
  @AllowPendingPasswordChange()
  @ApiOperation({ summary: 'ACC-19: current session user (frontend reads the user from here)' })
  async me(@CurrentUser() user: JwtUser) {
    return this.users.toPublic(await this.users.findById(user.sub));
  }

  @Patch('change-password')
  @AllowPendingPasswordChange()
  @ApiOperation({ summary: 'ACC-08: change password (signs out other sessions)' })
  async changePassword(@CurrentUser() user: JwtUser, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(user, dto);
    return { message: 'Password changed' };
  }
}
