import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsOptional, Matches, IsUrl } from 'class-validator';
export class CreateAirlineDto {
  @ApiProperty() @IsString() @Matches(/\S/) name: string;
  @ApiProperty({ example: 'MS' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9]{2,3}$/)
  code: string;
  @ApiProperty() @IsString() @Matches(/\S/) country: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({
    description: 'Validated upload URL provided by P4 (GEN-08)',
  })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  logo?: string;
}
