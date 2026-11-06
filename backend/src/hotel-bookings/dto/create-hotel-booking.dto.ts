import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsMongoId,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class HotelBookingRoomDto {
  @IsMongoId()
  @ApiProperty()
  roomId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @ApiProperty({ minimum: 1, maximum: 20 })
  guestCount: number;
}

export class CreateHotelBookingDto {
  @IsMongoId()
  @ApiProperty()
  hotelId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @ApiProperty({ format: 'date' })
  checkIn: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @ApiProperty({ format: 'date' })
  checkOut: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique((room: HotelBookingRoomDto) => room.roomId)
  @ValidateNested({ each: true })
  @Type(() => HotelBookingRoomDto)
  @ApiProperty({ type: [HotelBookingRoomDto], minItems: 1, maxItems: 10 })
  rooms: HotelBookingRoomDto[];

  @IsBoolean()
  @ApiProperty({
    description: 'Must be true to save the policy acceptance timestamp.',
  })
  acceptPolicies: boolean;
}
