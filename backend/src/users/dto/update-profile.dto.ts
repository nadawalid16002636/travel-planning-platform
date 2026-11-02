import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString, IsISO4217CurrencyCode, IsOptional, IsString, Length, Matches, MaxLength, ValidateNested,
} from 'class-validator';

class PreferencesDto {
  @ApiPropertyOptional({ example: 'EGP' }) @IsOptional() @IsISO4217CurrencyCode() currency?: string;
  @ApiPropertyOptional({ example: 'en' }) @IsOptional() @IsString() @Length(2, 5) language?: string;
}

/** ACC-09. Email, role and status cannot be changed here. */
export class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 50) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 50) lastName?: string;
  @ApiPropertyOptional({ example: '+201001234567' })
  @IsOptional() @Matches(/^\+?[0-9\s-]{7,20}$/, { message: 'Invalid phone number' }) phone?: string;
  @ApiPropertyOptional({ example: 'Egyptian' }) @IsOptional() @IsString() @MaxLength(60) nationality?: string;
  @ApiPropertyOptional({ example: '2003-05-14' }) @IsOptional() @IsDateString() dateOfBirth?: string;
  @ApiPropertyOptional({ type: PreferencesDto })
  @IsOptional() @ValidateNested() @Type(() => PreferencesDto) preferences?: PreferencesDto;
}
