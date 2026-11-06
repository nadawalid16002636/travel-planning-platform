import { PartialType } from '@nestjs/swagger';
import { CreateHotelDto } from './create-hotel.dto.js';

export class UpdateHotelDto extends PartialType(CreateHotelDto) {}
