import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AUTH_RULES } from '../../common/auth.config.js';

/** ACC-08 */
export class ChangePasswordDto {
  @ApiProperty() @IsString() @MaxLength(128) currentPassword: string;

  @ApiProperty({ example: 'NewTravel#2026' })
  @IsString()
  @MinLength(AUTH_RULES.passwordMinLength, { message: AUTH_RULES.passwordMessage })
  @MaxLength(AUTH_RULES.passwordMaxLength, { message: AUTH_RULES.passwordMessage })
  @Matches(AUTH_RULES.passwordPattern, { message: AUTH_RULES.passwordMessage })
  newPassword: string;
}
