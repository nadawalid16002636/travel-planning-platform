import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SuspendAccountDto {
  @ApiPropertyOptional({ example: 'Repeated policy violations' })
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
