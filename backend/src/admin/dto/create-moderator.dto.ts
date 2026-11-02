import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsMongoId, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { AUTH_RULES } from '../../common/auth.config.js';
import { ProviderType } from '../../users/schemas/user.schema.js';

/** ACC-13: a moderator manages exactly one airline or one hotel. */
export class CreateModeratorDto {
  @ApiProperty({ example: 'ops@egyptair.example' }) @IsEmail() email: string;
  @ApiProperty() @IsString() @Length(1, 50) firstName: string;
  @ApiProperty() @IsString() @Length(1, 50) lastName: string;

  @ApiProperty({ description: 'Initial password; the moderator must change it at first login' })
  @IsString()
  @MinLength(AUTH_RULES.passwordMinLength, { message: AUTH_RULES.passwordMessage })
  @MaxLength(AUTH_RULES.passwordMaxLength, { message: AUTH_RULES.passwordMessage })
  @Matches(AUTH_RULES.passwordPattern, { message: AUTH_RULES.passwordMessage })
  password: string;

  @ApiProperty({ enum: ProviderType }) @IsEnum(ProviderType) providerType: ProviderType;
  @ApiProperty({ description: 'Id of the airline or hotel this moderator manages' })
  @IsMongoId() providerId: string;
}
