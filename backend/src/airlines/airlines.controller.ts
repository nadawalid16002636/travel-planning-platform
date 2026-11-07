import { Public } from '../common/decorators.js';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
  UseFilters,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AirlinesService } from './airlines.service.js';
import { CreateAirlineDto } from './dto/create-airline.dto.js';
import { UpdateAirlineDto } from './dto/update-airline.dto.js';
import { UpdateBaggagePolicyDto } from './dto/update-baggage-policy.dto.js';
import { CancellationPolicyDto } from '../p2/dto.js';
import { P2Access } from '../p2/access.js';
import { P2ErrorFilter } from '../p2/errors.js';

@ApiTags('Airlines')
@UseFilters(P2ErrorFilter)
@ApiResponse({ status: 400, description: 'Invalid airline input' })
@ApiResponse({
  status: 401,
  description: 'P1 authentication required for management',
})
@ApiResponse({
  status: 403,
  description: 'Assigned airline moderator or administrator required',
})
@ApiResponse({ status: 404, description: 'Airline not found' })
@ApiResponse({ status: 409, description: 'Duplicate airline identifier' })
@Controller('airlines')
export class AirlinesController {
  constructor(
    private readonly airlinesService: AirlinesService,
    private readonly access: P2Access,
  ) {}
  @Post()
  @UseGuards(P2Access)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'FLT-01: Create airline (administrator)' })
  create(@Body() dto: CreateAirlineDto, @Req() req: any) {
    this.access.manage(req.p2Principal);
    return this.airlinesService.create(dto);
  }
  @Get()
  @UseGuards(P2Access)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'FLT-01: List airlines (administrator)' })
  findAll(@Req() req: any) {
    this.access.manage(req.p2Principal);
    return this.airlinesService.findAll();
  }
  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'FLT-01: Retrieve airline and current policies' })
  findOne(@Param('id') id: string) {
    return this.airlinesService.findOne(id);
  }
  @Patch(':id')
  @UseGuards(P2Access)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'FLT-01: Update assigned airline' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAirlineDto,
    @Req() req: any,
  ) {
    this.access.manage(req.p2Principal, id);
    return this.airlinesService.update(id, dto);
  }
  @Put(':id/baggage-policy')
  @UseGuards(P2Access)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'FLT-04, FLT-08: Replace checked, cabin and extra baggage policy',
  })
  baggage(
    @Param('id') id: string,
    @Body() dto: UpdateBaggagePolicyDto,
    @Req() req: any,
  ) {
    this.access.manage(req.p2Principal, id);
    return this.airlinesService.setPolicy(id, 'baggagePolicy', dto);
  }
  @Put(':id/cancellation-policy')
  @UseGuards(P2Access)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'FLT-09: Replace airline cancellation policy' })
  cancellation(
    @Param('id') id: string,
    @Body() dto: CancellationPolicyDto,
    @Req() req: any,
  ) {
    this.access.manage(req.p2Principal, id);
    return this.airlinesService.setPolicy(id, 'cancellationPolicy', dto);
  }
}
