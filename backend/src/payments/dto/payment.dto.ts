import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsMongoId } from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({ enum: ['flight', 'hotel'] })
  @IsIn(['flight', 'hotel'])
  bookingType: 'flight' | 'hotel';

  @ApiProperty()
  @IsMongoId()
  bookingId: string;
}
