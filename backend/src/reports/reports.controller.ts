import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors, CurrentUser, Roles } from '../common/decorators.js';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe.js';
import { Role, type JwtUser } from '../common/roles.js';
import { ContentActionDto, CreateReportDto, ListReportsDto, ResolveReportDto } from './dto/report.dto.js';
import { ReportsService } from './reports.service.js';
import { REPORT_TARGETS, type ReportTarget } from './schemas/report.schema.js';
import { BadRequestException } from '@nestjs/common';

function targetType(value: string): ReportTarget {
  if (!(REPORT_TARGETS as readonly string[]).includes(value)) {
    throw new BadRequestException('Content type must be post, comment, review or itinerary');
  }
  return value as ReportTarget;
}

@ApiTags('Reports')
@ApiCookieAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Roles(Role.USER)
  @Post()
  @ApiOperation({ summary: 'GEN-09: report a post, comment, review or itinerary once' })
  @ApiErrors(400, 401, 403, [404, 'Content not found'], [409, 'You have already reported this'])
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateReportDto) {
    return this.reports.create(user.sub, dto);
  }
}

@ApiTags('Reports')
@ApiCookieAuth()
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('reports')
  @ApiOperation({ summary: 'GEN-10, GEN-05: open reports (page size 10)' })
  @ApiErrors(401, 403)
  list(@Query() query: ListReportsDto) {
    return this.reports.list(query);
  }

  @Patch('reports/:id')
  @ApiOperation({ summary: 'GEN-10, GEN-07: dismiss a report, or hide or delete the content' })
  @ApiErrors(400, 401, 403, [404, 'Report not found'], [409, 'Report is already resolved'])
  resolve(@CurrentUser() admin: JwtUser, @Param('id', ParseObjectIdPipe) id: string, @Body() dto: ResolveReportDto) {
    return this.reports.resolve(id, admin.sub, dto);
  }

  @Delete('content/:type/:id')
  @ApiOperation({ summary: 'GEN-10, GEN-07: hide or delete a post, comment, review or itinerary directly' })
  @ApiErrors(400, 401, 403, [404, 'Content not found'])
  remove(
    @CurrentUser() admin: JwtUser,
    @Param('type') type: string,
    @Param('id', ParseObjectIdPipe) id: string,
    @Query() query: ContentActionDto,
  ) {
    return this.reports.moderate(targetType(type), id, admin.sub, query);
  }
}
