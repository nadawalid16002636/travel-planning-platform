import { randomBytes } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../common/decorators.js';
import { Role, type JwtUser } from '../common/roles.js';
import { paginate, PaginationQueryDto } from '../common/pagination.dto.js';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe.js';
import { AuditService } from '../audit/audit.service.js';
import { SessionsService } from '../auth/sessions.service.js';
import { UsersService } from '../users/users.service.js';
import { AccountStatus } from '../users/schemas/user.schema.js';
import { CreateModeratorDto } from './dto/create-moderator.dto.js';
import { ListAccountsDto } from './dto/list-accounts.dto.js';
import { SuspendAccountDto } from './dto/suspend-account.dto.js';

@ApiTags('Admin')
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly sessions: SessionsService,
  ) {}

  @Post('moderators')
  @ApiOperation({ summary: 'ACC-13: create an airline or hotel moderator account' })
  async createModerator(@CurrentUser() admin: JwtUser, @Body() dto: CreateModeratorDto) {
    // TODO P2/P3: once Airline and Hotel schemas exist, check that providerId exists
    const { providerType, ...rest } = dto;
    const user = await this.users.create({
      ...rest,
      providerType,
      providerId: dto.providerId as any,
      role: providerType === 'airline' ? Role.AIRLINE_MOD : Role.HOTEL_MOD,
      mustChangePassword: true,
    });
    await this.audit.log(admin.sub, 'MODERATOR_CREATED', 'user', user.id, { providerType, providerId: dto.providerId });
    return this.users.toPublic(user);
  }

  @Get('accounts')
  @ApiOperation({ summary: 'ACC-14: list and search platform accounts' })
  async accounts(@Query() q: ListAccountsDto) {
    const filter: Record<string, unknown> = {};
    if (q.role) filter.role = q.role;
    if (q.status) filter.status = q.status;
    if (q.search) {
      const rx = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ email: rx }, { firstName: rx }, { lastName: rx }];
    }
    const { data, total } = await this.users.list(filter, q.page, q.limit);
    return paginate(data, total, q);
  }

  @Patch('accounts/:id/suspend')
  @ApiOperation({ summary: 'ACC-15, ACC-16: suspend a user or moderator (signs them out immediately)' })
  async suspend(
    @CurrentUser() admin: JwtUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: SuspendAccountDto,
  ) {
    const user = await this.users.setStatus(id, AccountStatus.SUSPENDED, dto.reason);
    await this.sessions.revokeAllForUser(id);
    // TODO P4: this.notifications.notify(id, 'ACCOUNT_SUSPENDED', { reason: dto.reason })  (GEN-01)
    await this.audit.log(admin.sub, 'ACCOUNT_SUSPENDED', 'user', id, { reason: dto.reason });
    return user;
  }

  @Patch('accounts/:id/reactivate')
  @ApiOperation({ summary: 'ACC-15, ACC-16: reactivate a suspended account' })
  async reactivate(@CurrentUser() admin: JwtUser, @Param('id', ParseObjectIdPipe) id: string) {
    const user = await this.users.setStatus(id, AccountStatus.ACTIVE);
    await this.audit.log(admin.sub, 'ACCOUNT_REACTIVATED', 'user', id);
    return user;
  }

  @Post('users/:id/reset-password')
  @HttpCode(200)
  @ApiOperation({
    summary: 'ACC-07a: admin-assisted password reset; returns a one-time temporary password',
  })
  async resetPassword(@CurrentUser() admin: JwtUser, @Param('id', ParseObjectIdPipe) id: string) {
    const user = await this.users.findById(id);
    // meets the password rules: letters and digits
    const temporaryPassword = `Tmp-${randomBytes(6).toString('hex')}9`;
    await this.users.setPassword(user, temporaryPassword, true);
    await this.sessions.revokeAllForUser(id);
    await this.audit.log(admin.sub, 'PASSWORD_RESET_BY_ADMIN', 'user', id);
    return {
      message: 'Password reset. Give the temporary password to the user; they must change it after logging in.',
      temporaryPassword,
    };
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'GEN-07: view the audit log' })
  async auditLogs(@Query() q: PaginationQueryDto) {
    const { data, total } = await this.audit.list(q.page, q.limit);
    return paginate(data, total, q);
  }

  // ACC-15 provider deactivation: PATCH /admin/airlines/:id and /admin/hotels/:id belong to P2 / P3.
  // ACC-17 GET /admin/bookings: added once flight-bookings (P2) and hotel-bookings (P3) exist.
}
