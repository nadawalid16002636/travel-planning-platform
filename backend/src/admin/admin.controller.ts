import { randomBytes } from 'node:crypto';
import { BadRequestException, Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors, CurrentUser, Roles } from '../common/decorators.js';
import { Role, type JwtUser } from '../common/roles.js';
import { paginate, PaginationQueryDto } from '../common/pagination.dto.js';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe.js';
import { AuditService } from '../audit/audit.service.js';
import { SessionsService } from '../auth/sessions.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { UsersService } from '../users/users.service.js';
import { AccountStatus } from '../users/schemas/user.schema.js';
import { CreateModeratorDto } from './dto/create-moderator.dto.js';
import { ListBookingsDto } from './dto/list-bookings.dto.js';
import { ProviderParamsDto } from './dto/provider-params.dto.js';
import { ProvidersService } from './providers.service.js';
import { AdminBookingsService } from './admin-bookings.service.js';
import { ListAccountsDto } from './dto/list-accounts.dto.js';
import { SuspendAccountDto } from './dto/suspend-account.dto.js';

@ApiTags('Admin')
@ApiCookieAuth()
@ApiErrors(401, [403, 'Admins only'])
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly sessions: SessionsService,
    private readonly notifications: NotificationsService,
    private readonly providers: ProvidersService,
    private readonly bookings: AdminBookingsService,
  ) {}

  @Post('moderators')
  @ApiOperation({ summary: 'ACC-13: create an airline or hotel moderator account' })
  @ApiErrors(400, [404, 'Airline or hotel not found'], [409, 'Email is already registered'])
  async createModerator(@CurrentUser() admin: JwtUser, @Body() dto: CreateModeratorDto) {
    // ACC-13: the moderator is linked to exactly one existing airline or hotel
    await this.providers.findProvider(dto.providerType, dto.providerId);
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
  @ApiOperation({ summary: 'ACC-14, GEN-05: list and search platform accounts (page size 10)' })
  @ApiErrors(400)
  async accounts(@Query() q: ListAccountsDto) {
    const filter: Record<string, unknown> = {};
    if (q.role) filter.role = q.role;
    if (q.status) filter.status = q.status;
    if (q.search) {
      const rx = (v: string) => new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const term = q.search.trim();
      const [first, ...last] = term.split(/\s+/);
      filter.$or = [
        { email: rx(term) },
        { firstName: rx(term) },
        { lastName: rx(term) },
        ...(last.length ? [{ firstName: rx(first), lastName: rx(last.join(' ')) }] : []), // "Sara Ahmed"
      ];
    }
    const { data, total } = await this.users.list(filter, q.page, q.limit);
    return paginate(data, total, q);
  }

  @Patch('accounts/:id/suspend')
  @ApiOperation({ summary: 'ACC-15, ACC-16, GEN-01, GEN-07: suspend a user or moderator (signs them out immediately)' })
  @ApiErrors([400, 'Invalid id, administrator account, or already suspended'], [404, 'User not found'])
  async suspend(
    @CurrentUser() admin: JwtUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: SuspendAccountDto,
  ) {
    const user = await this.users.setStatus(id, AccountStatus.SUSPENDED, dto.reason);
    await this.sessions.revokeAllForUser(id);
    await this.notifications.notify(id, 'ACCOUNT_SUSPENDED', { reason: dto.reason }); // GEN-01
    await this.audit.log(admin.sub, 'ACCOUNT_SUSPENDED', 'user', id, { reason: dto.reason });
    return user;
  }

  @Patch('accounts/:id/reactivate')
  @ApiOperation({ summary: 'ACC-15, ACC-16, GEN-01, GEN-07: reactivate a suspended account' })
  @ApiErrors([400, 'Invalid id, administrator account, or already active'], [404, 'User not found'])
  async reactivate(@CurrentUser() admin: JwtUser, @Param('id', ParseObjectIdPipe) id: string) {
    const user = await this.users.setStatus(id, AccountStatus.ACTIVE);
    await this.audit.log(admin.sub, 'ACCOUNT_REACTIVATED', 'user', id);
    await this.notifications.notify(id, 'ACCOUNT_REACTIVATED', {}); // GEN-01
    return user;
  }

  @Post('users/:id/reset-password')
  @HttpCode(200)
  @ApiOperation({
    summary: 'ACC-07a, GEN-07: admin-assisted password reset; returns a one-time temporary password',
  })
  @ApiErrors([400, 'Invalid id or administrator account'], [404, 'User not found'])
  async resetPassword(@CurrentUser() admin: JwtUser, @Param('id', ParseObjectIdPipe) id: string) {
    const user = await this.users.findById(id);
    // ACC-07a covers users and moderators only
    if (user.role === Role.ADMIN) throw new BadRequestException('Administrator passwords cannot be reset here');
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
  @ApiOperation({ summary: 'GEN-07, GEN-05: view the audit log (page size 10)' })
  @ApiErrors(400)
  async auditLogs(@Query() q: PaginationQueryDto) {
    const { data, total } = await this.audit.list(q.page, q.limit);
    return paginate(data, total, q);
  }

  @Patch('providers/:type/:id/deactivate')
  @ApiOperation({
    summary: 'ACC-15, GEN-01, GEN-07: deactivate an airline or hotel (hidden from search, cannot be booked)',
  })
  @ApiErrors([400, 'Already inactive'], [404, 'Airline or hotel not found'])
  deactivateProvider(@CurrentUser() admin: JwtUser, @Param() p: ProviderParamsDto) {
    return this.changeProviderStatus(admin, p, false);
  }

  @Patch('providers/:type/:id/reactivate')
  @ApiOperation({ summary: 'ACC-15, GEN-01, GEN-07: reactivate an airline or hotel' })
  @ApiErrors([400, 'Already active'], [404, 'Airline or hotel not found'])
  reactivateProvider(@CurrentUser() admin: JwtUser, @Param() p: ProviderParamsDto) {
    return this.changeProviderStatus(admin, p, true);
  }

  private async changeProviderStatus(admin: JwtUser, { type, id }: ProviderParamsDto, active: boolean) {
    const current = await this.providers.findProvider(type, id);
    if (this.providers.isActive(type, current) === active) {
      throw new BadRequestException(`This ${type} is already ${active ? 'active' : 'inactive'}`);
    }
    const provider = await this.providers.setActive(type, id, active);
    const action = active ? 'PROVIDER_REACTIVATED' : 'PROVIDER_DEACTIVATED';
    await this.audit.log(admin.sub, action, type, id, { name: provider.name });

    // ACC-15: affected parties = the provider's moderators + travelers with upcoming confirmed bookings
    // (existing Confirmed bookings stay valid)
    const [moderators, customers] = await Promise.all([
      this.users.moderatorIdsFor(id),
      this.providers.upcomingCustomerIds(type, id),
    ]);
    const payload = { providerType: type, providerId: id, providerName: provider.name };
    await Promise.all(
      [...new Set([...moderators, ...customers])].map((userId) => this.notifications.notify(userId, action, payload)),
    );
    return { ...provider, notified: new Set([...moderators, ...customers]).size };
  }

  @Get('bookings')
  @ApiOperation({
    summary: 'ACC-17, GEN-05: read-only list of all flight and hotel bookings (filter by type, status, dates)',
  })
  @ApiErrors(400)
  listBookings(@Query() q: ListBookingsDto) {
    return this.bookings.list(q);
  }
}
