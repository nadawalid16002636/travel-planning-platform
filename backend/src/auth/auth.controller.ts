import { Body, Controller, Get, HttpCode, Patch, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Response } from 'express';
import { durationToMs } from '../common/auth.config.js';
import { CurrentUser, Public } from '../common/decorators.js';
import { AUTH_COOKIE, type JwtUser } from '../common/roles.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  /** Token lives only in an httpOnly cookie, never in the response body or localStorage. */
  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: durationToMs(this.config.get('JWT_EXPIRES_IN')),
    };
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'ACC-01, ACC-03: register a traveler account' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'ACC-04, ACC-05: log in (sets the httpOnly session cookie)' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.auth.login(dto);
    res.cookie(AUTH_COOKIE, token, this.cookieOptions());
    return { user };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'ACC-06: log out (clears the session cookie)' })
  logout(@Res({ passthrough: true }) res: Response) {
    const { maxAge, ...opts } = this.cookieOptions();
    res.clearCookie(AUTH_COOKIE, opts);
    return { message: 'Logged out' };
  }

  @Get('me')
  @ApiOperation({ summary: 'ACC-04, ACC-11: current session user' })
  async me(@CurrentUser() user: JwtUser) {
    return this.users.toPublic(await this.users.findById(user.sub));
  }

  @Patch('change-password')
  @ApiOperation({ summary: 'ACC-08: change password (signs out other sessions)' })
  async changePassword(
    @CurrentUser() user: JwtUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token } = await this.auth.changePassword(user, dto);
    res.cookie(AUTH_COOKIE, token, this.cookieOptions());
    return { message: 'Password changed' };
  }
}
