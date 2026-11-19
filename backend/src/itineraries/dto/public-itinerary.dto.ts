import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ItinerariesPaginationQueryDto } from './itineraries-pagination-query.dto.js';
import {
  BudgetCategoryTotalDto,
  BudgetCityGroupDto,
  BudgetCurrencyAmountDto,
  BudgetDayTotalDto,
  UnassignedLegacyCurrencyTotalDto,
} from './itinerary-budget-summary.dto.js';
import {
  ItineraryActivityResponseDto,
  ItineraryBudgetEntryResponseDto,
  ItineraryDayResponseDto,
  IntercityTransportEntryResponseDto,
  DayBudgetEntryResponseDto,
  ItineraryLegacyDataResponseDto,
} from './itinerary-response.dto.js';

export class PublicItinerarySearchDto extends ItinerariesPaginationQueryDto {
  @ApiPropertyOptional({ maxLength: 100, description: 'Matches title, country, or city names.' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @ApiPropertyOptional({ example: 'EG', description: 'Filter by canonical country code.' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^[A-Za-z]{2}$/)
  country?: string;

  @ApiPropertyOptional({ example: 'cairo', description: 'Filter by canonical city ID.' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 60 })
  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  minDays?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 60 })
  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  maxDays?: number;
}

export class PublicItinerarySearchItemDto {
  @ApiProperty({ example: '64b000000000000000000002' })
  id: string;

  @ApiProperty({ maxLength: 100 })
  title: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ type: [String] })
  countryCodes: string[];

  @ApiProperty({ type: String, format: 'date-time' })
  startDate: string;

  @ApiProperty({ minimum: 0, maximum: 60 })
  durationDays: number;

  @ApiProperty({ type: [String], description: 'Canonical city IDs used by this itinerary.' })
  cityIds: string[];

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  updatedAt?: string;
}

export class PaginatedPublicItinerariesDto {
  @ApiProperty({ type: [PublicItinerarySearchItemDto] })
  data: PublicItinerarySearchItemDto[];

  @ApiProperty({ minimum: 1 })
  page: number;

  @ApiProperty({ minimum: 1, maximum: 10 })
  limit: number;

  @ApiProperty({ minimum: 0 })
  total: number;
}

export class PublicAuthorDto {
  @ApiProperty({ example: '64b000000000000000000003' })
  id: string;

  @ApiProperty({ example: 'Alex Morgan' })
  name: string;
}

export class PublicItineraryBudgetDto {
  @ApiProperty({ example: '64b000000000000000000002' })
  itineraryId: string;

  @ApiProperty({ type: [BudgetCurrencyAmountDto], description: 'Raw totals remain separated by currency.' })
  totalsByCurrency: BudgetCurrencyAmountDto[];

  @ApiProperty({ type: [BudgetCategoryTotalDto] })
  categoryTotals: BudgetCategoryTotalDto[];

  @ApiProperty({ type: [BudgetDayTotalDto] })
  dayTotals: BudgetDayTotalDto[];

  @ApiProperty({ type: [BudgetCityGroupDto] })
  cityGroups: BudgetCityGroupDto[];

  @ApiProperty({ type: [UnassignedLegacyCurrencyTotalDto] })
  unassignedLegacyByCurrency: UnassignedLegacyCurrencyTotalDto[];
}

export class PublicCityInfoDto {
  @ApiProperty({ example: 'cairo' })
  id: string;

  @ApiProperty({ example: 'Cairo' })
  name: string;

  @ApiProperty({ example: 'EG' })
  countryCode: string;
}

export class PublicIntercityTransportEntryDto extends IntercityTransportEntryResponseDto {
  @ApiPropertyOptional({ type: PublicCityInfoDto, nullable: true })
  fromCityInfo?: PublicCityInfoDto | null;

  @ApiPropertyOptional({ type: PublicCityInfoDto, nullable: true })
  toCityInfo?: PublicCityInfoDto | null;
}

export class PublicItineraryDayDto extends ItineraryDayResponseDto {
  @ApiPropertyOptional({ type: PublicCityInfoDto, nullable: true })
  cityInfo?: PublicCityInfoDto | null;

  @ApiProperty({ type: [ItineraryActivityResponseDto] })
  activities: ItineraryActivityResponseDto[];

  @ApiProperty({ type: [DayBudgetEntryResponseDto] })
  budgetEntries: DayBudgetEntryResponseDto[];

  @ApiProperty({ type: [PublicIntercityTransportEntryDto] })
  transportEntries: PublicIntercityTransportEntryDto[];
}

export class PublicItineraryDetailsDto {
  @ApiProperty({ example: '64b000000000000000000002' })
  id: string;

  @ApiProperty({ maxLength: 100 })
  title: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ type: [String], nullable: true })
  countryCodes: string[] | null;

  @ApiProperty({ type: String, format: 'date-time' })
  startDate: string;

  @ApiProperty({ type: PublicAuthorDto })
  author: PublicAuthorDto;

  @ApiProperty({ type: [PublicItineraryDayDto] })
  days: PublicItineraryDayDto[];

  @ApiProperty({ type: [ItineraryBudgetEntryResponseDto] })
  budgetEntries: ItineraryBudgetEntryResponseDto[];

  @ApiProperty({ type: PublicItineraryBudgetDto, description: 'Dynamically calculated raw budget totals; currencies are not combined.' })
  budgetSummary: PublicItineraryBudgetDto;

  @ApiPropertyOptional({ type: ItineraryLegacyDataResponseDto })
  legacyData?: ItineraryLegacyDataResponseDto;

}
