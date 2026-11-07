import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'sara@example.com' }) @IsEmail() email: string;
  @ApiProperty({ example: 'Travel#2026' }) @IsString() @MaxLength(128) password: string;
}
