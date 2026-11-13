import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsMongoId } from 'class-validator';
import { UPLOAD_PURPOSES, type UploadPurpose } from '../upload.rules.js';

export class UploadQueryDto {
  @ApiProperty({ enum: UPLOAD_PURPOSES })
  @IsIn(UPLOAD_PURPOSES)
  purpose: UploadPurpose;

  @ApiProperty({ description: 'Airline, hotel, post or activity id the image belongs to' })
  @IsMongoId()
  entityId: string;
}
