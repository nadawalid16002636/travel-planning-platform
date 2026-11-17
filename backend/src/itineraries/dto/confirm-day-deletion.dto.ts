import { ApiProperty } from '@nestjs/swagger';
import { Equals } from 'class-validator';

export class ConfirmDayDeletionDto {
  @ApiProperty({ enum: [true], description: 'Must be true to confirm deletion.' })
  @Equals(true)
  confirmed: boolean;
}
