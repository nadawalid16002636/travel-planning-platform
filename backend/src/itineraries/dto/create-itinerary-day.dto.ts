import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, ValidateIf } from 'class-validator';

export class CreateItineraryDayDto {
  @ApiProperty({ example: 'cairo', description: 'A seeded Reference city ID.' })
  @IsString()
  @IsNotEmpty()
  cityId: string;

  @ApiPropertyOptional({ example: 'Arrive in the morning' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  notes?: string;
}
