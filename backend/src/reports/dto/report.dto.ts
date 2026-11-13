import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.dto.js';
import { REPORT_STATUSES, REPORT_TARGETS } from '../schemas/report.schema.js';

export class CreateReportDto {
  @ApiProperty({ enum: REPORT_TARGETS })
  @IsIn(REPORT_TARGETS)
  targetType: (typeof REPORT_TARGETS)[number];

  @ApiProperty()
  @IsMongoId()
  targetId: string;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;
}

export class ListReportsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: REPORT_STATUSES, default: 'open' })
  @IsOptional()
  @IsIn(REPORT_STATUSES)
  status: (typeof REPORT_STATUSES)[number] = 'open';
}

export class ResolveReportDto {
  @ApiProperty({ enum: ['dismiss', 'hide', 'delete'] })
  @IsIn(['dismiss', 'hide', 'delete'])
  action: 'dismiss' | 'hide' | 'delete';
}

export class ContentActionDto {
  @ApiPropertyOptional({ enum: ['hide', 'delete'], default: 'delete' })
  @IsOptional()
  @IsIn(['hide', 'delete'])
  action: 'hide' | 'delete' = 'delete';
}
