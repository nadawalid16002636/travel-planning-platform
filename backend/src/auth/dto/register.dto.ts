import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { AUTH_RULES } from '../../common/auth.config.js';

/** ACC-01, ACC-03. Role is never accepted from the client: self-registration always creates a USER. */
export class RegisterDto {
  @ApiProperty({ example: 'sara@example.com' }) @IsEmail() @MaxLength(254) email: string;

  @ApiProperty({ example: 'Travel#2026' })
  @IsString()
  @MinLength(AUTH_RULES.passwordMinLength, { message: AUTH_RULES.passwordMessage })
  @MaxLength(AUTH_RULES.passwordMaxLength, { message: AUTH_RULES.passwordMessage })
  @Matches(AUTH_RULES.passwordPattern, { message: AUTH_RULES.passwordMessage })
  password: string;

  @ApiProperty({ example: 'Sara' }) @IsString() @Length(1, 50) firstName: string;
  @ApiProperty({ example: 'Ahmed' }) @IsString() @Length(1, 50) lastName: string;

  @ApiPropertyOptional({ example: '+201001234567' })
  @IsOptional() @Matches(/^\+?[0-9\s-]{7,20}$/, { message: 'Invalid phone number' }) phone?: string;
}
