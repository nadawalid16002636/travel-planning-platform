import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsMongoId } from 'class-validator';

export class ProviderParamsDto {
  @ApiProperty({ enum: ['airline', 'hotel'] }) @IsIn(['airline', 'hotel']) type: 'airline' | 'hotel';
  @ApiProperty() @IsMongoId({ message: 'Invalid id' }) id: string;
}
