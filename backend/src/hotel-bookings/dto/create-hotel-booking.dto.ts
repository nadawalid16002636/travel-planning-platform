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
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class HotelBookingRoomDto {
  @IsMongoId()
  @ApiProperty()
  roomId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  @ApiProperty({ minimum: 0, maximum: 20, default: 0 })
  adults = 0;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(17, { each: true })
  @ApiProperty({ type: [Number], maxItems: 20 })
  childrenAges: number[] = [];
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
