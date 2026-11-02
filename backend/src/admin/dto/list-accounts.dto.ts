import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.dto.js';
import { Role } from '../../common/roles.js';
import { AccountStatus } from '../../users/schemas/user.schema.js';

export class ListAccountsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Role }) @IsOptional() @IsEnum(Role) role?: Role;
  @ApiPropertyOptional({ enum: AccountStatus }) @IsOptional() @IsEnum(AccountStatus) status?: AccountStatus;
  @ApiPropertyOptional({ description: 'Search by email or name' })
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}
