import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/** ACC-12: the user confirms with their current password. */
export class DeactivateAccountDto {
  @ApiProperty() @IsString() password: string;
}
