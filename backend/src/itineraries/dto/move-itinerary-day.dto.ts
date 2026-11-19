import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class MoveItineraryDayDto {
  @ApiProperty({ minimum: 1, example: 2, description: 'Final 1-based day position.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  newDayOrder: number;
}
