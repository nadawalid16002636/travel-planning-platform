import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors, CurrentUser } from '../common/decorators.js';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe.js';
import type { JwtUser } from '../common/roles.js';
import { ListNotificationsDto } from './dto/list-notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('Notifications')
@ApiCookieAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('unread-count')
  @ApiOperation({ summary: 'GEN-01: unread in-app notification count' })
  @ApiErrors(401)
  unread(@CurrentUser() user: JwtUser) {
    return this.notifications.unreadCount(user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'GEN-01, GEN-05: notification list (page size 10)' })
  @ApiErrors(401)
  list(@CurrentUser() user: JwtUser, @Query() query: ListNotificationsDto) {
    return this.notifications.list(user.sub, query);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'GEN-01: mark every notification as read' })
  @ApiErrors(401)
  readAll(@CurrentUser() user: JwtUser) {
    return this.notifications.markAllRead(user.sub);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'GEN-01: mark one notification as read' })
  @ApiErrors(401, [404, 'Notification not found'])
  read(@CurrentUser() user: JwtUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.notifications.markRead(user.sub, id);
  }
}
