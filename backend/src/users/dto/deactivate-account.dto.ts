import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

/** ACC-12: the user confirms with their current password. */
export class DeactivateAccountDto {
  @ApiProperty() @IsString() @MaxLength(128) password: string;
}
