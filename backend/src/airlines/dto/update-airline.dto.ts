import { PartialType } from '@nestjs/swagger';
import { CreateAirlineDto } from './create-airline.dto.js';

export class UpdateAirlineDto extends PartialType(CreateAirlineDto, {
  skipNullProperties: false,
}) {}
