import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, ValidateIf } from 'class-validator';

export class UpdateItineraryDayDto {
  @ApiPropertyOptional({ example: 'cairo', description: 'A seeded Reference city ID.' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  cityId?: string;

  @ApiPropertyOptional({ example: 'Visit the museum in the afternoon' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  notes?: string;
}
