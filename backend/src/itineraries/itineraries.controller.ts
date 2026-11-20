import { UpdateItineraryDaysDto } from './dto/update-itinerary-days.dto.js';
import {
  BadRequestException,
  Controller,
  Post,
  Body,
  Get,
  Param,
  Put,
  Patch,
  Delete,
  Query,
  ParseIntPipe,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiExtraModels, ApiOkResponse, ApiOperation, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import { ApiErrors, CurrentUser, Public } from '../common/decorators.js';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe.js';
import { MAX_IMAGE_BYTES } from '../uploads/upload.rules.js';

import { ItinerariesService } from './itineraries.service.js';
import { CreateItineraryDto } from './dto/create-itinerary.dto.js';
import { UpdateItineraryDto } from './dto/update-itinerary.dto.js';
import { ConfirmItineraryDeletionDto } from './dto/confirm-itinerary-deletion.dto.js';
import { CreateItineraryDayDto } from './dto/create-itinerary-day.dto.js';
import { UpdateItineraryDayDto } from './dto/update-itinerary-day.dto.js';
import { ConfirmDayDeletionDto } from './dto/confirm-day-deletion.dto.js';
import { MoveItineraryDayDto } from './dto/move-itinerary-day.dto.js';
import { ItinerariesPaginationQueryDto } from './dto/itineraries-pagination-query.dto.js';
import { CreateDayBudgetEntryDto } from './dto/create-day-budget-entry.dto.js';
import { UpdateDayBudgetEntryDto } from './dto/update-day-budget-entry.dto.js';
import { CreateIntercityTransportEntryDto } from './dto/create-intercity-transport-entry.dto.js';
import { UpdateIntercityTransportEntryDto } from './dto/update-intercity-transport-entry.dto.js';
import { CreateItineraryActivityDto } from './dto/create-itinerary-activity.dto.js';
import { UpdateItineraryActivityDto } from './dto/update-itinerary-activity.dto.js';
import {
  PaginatedPublicItinerariesDto,
  PublicItineraryDetailsDto,
  PublicItinerarySearchDto,
} from './dto/public-itinerary.dto.js';
import {
  ItineraryFlightSearchDto,
  ItineraryFlightSearchResponseDto,
  ItineraryHotelSearchDto,
  ItineraryHotelSearchResponseDto,
} from './dto/itinerary-search-integrations.dto.js';
import { ItineraryBudgetSummaryDto } from './dto/itinerary-budget-summary.dto.js';
import {
  ItineraryBudgetConversionAvailableDto,
  ItineraryBudgetConversionUnavailableDto,
} from './dto/itinerary-budget-conversion.dto.js';
import {
  DeleteItineraryResponseDto,
  ItineraryResponseDto,
  PaginatedItinerariesResponseDto,
} from './dto/itinerary-response.dto.js';
import type { JwtUser } from '../common/roles.js';
import { AssociateFlightBookingDto } from './dto/itinerary-booking.dto.js';

@Controller('itineraries')
@ApiTags('Itineraries')
export class ItinerariesController {
  constructor(
    private readonly itinerariesService: ItinerariesService,
  ) {}

  @Post(':id/days/:dayOrder/bookings')
  @ApiOperation({ summary: 'ITN-27: Associate an owned confirmed flight booking with its departure day' })
  @ApiBody({ type: AssociateFlightBookingDto })
  @ApiOkResponse({ type: ItineraryResponseDto, description: 'Returns the updated owned itinerary. The booking remains owned by the flight-booking service.' })
  @ApiErrors(400, 401, 403, [404, 'Itinerary, day, or booking not found'], [409, 'Booking is not confirmed or is already associated'])
  associateFlightBooking(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayOrder', ParseIntPipe) dayOrder: number,
    @Body() dto: AssociateFlightBookingDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.associateFlightBooking(id, dayOrder, dto, user);
  }

  @Delete(':id/days/:dayOrder/bookings/:bookingId')
  @ApiOperation({ summary: 'ITN-27: Remove a booking association without cancelling the booking' })
  @ApiOkResponse({ type: ItineraryResponseDto })
  @ApiErrors(400, 401, 403, [404, 'Itinerary, day, or association not found'])
  removeFlightBookingAssociation(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayOrder', ParseIntPipe) dayOrder: number,
    @Param('bookingId', ParseObjectIdPipe) bookingId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.removeFlightBookingAssociation(id, dayOrder, bookingId, user);
  }

  @Get(':id/export.pdf')
  @ApiOperation({ summary: 'ITN-28: Export an owned itinerary as a paginated PDF' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'PDF document attachment.', schema: { type: 'string', format: 'binary' } })
  @ApiErrors(400, 401, 403, [404, 'Itinerary not found'])
  async exportPdf(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: JwtUser) {
    const buffer = await this.itinerariesService.exportPdf(id, user);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: 'attachment; filename="itinerary.pdf"',
    });
  }

  @Post()
  @ApiOperation({ summary: 'ITN-01: Create an itinerary using seeded country and city IDs' })
  @ApiErrors(400, 401, [404, 'Unknown country or city reference'])
  create(
    @Body() createItineraryDto: CreateItineraryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.create(
      createItineraryDto,
      user,
    );
  }

  @Get()
  @ApiOperation({
    summary: "ITN-03: List the authenticated user's itineraries",
    description: 'Results are ordered by updatedAt descending and use GEN-05 pagination with a maximum page size of 10.',
  })
  @ApiOkResponse({ type: PaginatedItinerariesResponseDto })
  @ApiErrors(400, 401)
  findAll(@Query() query: ItinerariesPaginationQueryDto, @CurrentUser() user: JwtUser) {
    return this.itinerariesService.findAll(user, query);
  }

  @Get(':id/city-groups/:startDayOrder/hotels')
  @ApiOperation({
    summary: 'ITN-25: Search hotels for an owned itinerary city group',
    description: 'The city is resolved from the selected consecutive city group. Check-in is its first day date and check-out is the day after its last day. guests and rooms are required. This endpoint searches only; it does not create a booking.',
  })
  @ApiParam({ name: 'startDayOrder', description: 'First 1-based day order of the selected city group.', schema: { type: 'integer', minimum: 1 } })
  @ApiOkResponse({ type: ItineraryHotelSearchResponseDto })
  @ApiErrors(400, 401, 403, [404, 'Itinerary, city group, or city/country reference not found'])
  searchHotelsForCityGroup(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('startDayOrder', ParseIntPipe) startDayOrder: number,
    @Query() query: ItineraryHotelSearchDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.searchHotelsForCityGroup(id, startDayOrder, query, user);
  }

  @Get(':id/flight-search')
  @ApiOperation({
    summary: 'ITN-26: Search flights to the first itinerary day city',
    description: 'Requires a user-chosen origin airport. The outbound date defaults to the first travel day; a round-trip return date defaults to the last travel day. If arrivalAirport is omitted, flights are searched to each airport mapped to the first day city. This endpoint does not create a booking.',
  })
  @ApiOkResponse({ type: ItineraryFlightSearchResponseDto })
  @ApiErrors(400, 401, 403, [404, 'Itinerary city reference not found'])
  searchFlightsForItinerary(
    @Param('id', ParseObjectIdPipe) id: string,
    @Query() query: ItineraryFlightSearchDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.searchFlightsForItinerary(id, query, user);
  }

  @Get('public')
  @Public()
  @ApiOperation({
    summary: 'ITN-21: Search public itineraries',
    description: 'Guest-accessible paginated search. Only public itineraries are returned; keyword matches title, country, or city.',
  })
  @ApiOkResponse({ type: PaginatedPublicItinerariesDto })
  @ApiErrors(400, [404, 'Unknown country or city filter'])
  searchPublic(@Query() query: PublicItinerarySearchDto) {
    return this.itinerariesService.searchPublic(query);
  }

  @Get('public/:id')
  @Public()
  @ApiOperation({
    summary: 'ITN-21: Read public itinerary details',
    description: 'Returns public itinerary days, activities, reference city details, budget entries and author name. Private owner data is omitted and the itinerary is read-only.',
  })
  @ApiOkResponse({ type: PublicItineraryDetailsDto })
  @ApiErrors(400, [404, 'Public itinerary not found'])
  getPublicDetails(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user?: JwtUser) {
    return this.itinerariesService.getPublicDetails(id, user);
  }

  @Post('public/:id/clone')
  @ApiOperation({
    summary: 'ITN-21: Clone a public itinerary',
    description: 'Creates an independent private draft for the authenticated user, with attribution to the source itinerary and author.',
  })
  @ApiCreatedResponse({ type: ItineraryResponseDto })
  @ApiErrors(400, 401, [404, 'Public itinerary not found'])
  clonePublicItinerary(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.clonePublicItinerary(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'ITN-01, ITN-20: Edit an owned itinerary, including visibility' })
  @ApiBody({ type: UpdateItineraryDto })
  @ApiOkResponse({ type: ItineraryResponseDto })
  @ApiErrors(400, 401, 403, [404, 'Itinerary or reference not found'])
  updateItinerary(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() updateDto: UpdateItineraryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.updateItinerary(id, updateDto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'ITN-01, GEN-03: Delete an owned itinerary after confirmation' })
  @ApiOkResponse({ type: DeleteItineraryResponseDto })
  @ApiErrors(400, 401, [404, 'Itinerary not found'])
  deleteItinerary(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() confirmation: ConfirmItineraryDeletionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.deleteItinerary(id, confirmation, user);
  }

  @Post(':id/days')
  @ApiOperation({
    summary: 'ITN-05: Add a day to an owned itinerary',
    description:
      'Appends the new day. Day order and its UTC date-only date are derived by the backend from startDate. An itinerary may contain at most 60 days.',
  })
  @ApiCreatedResponse({ type: ItineraryResponseDto })
  @ApiErrors(
    400,
    401,
    403,
    [404, 'Itinerary or city reference not found'],
    [409, 'Stored itinerary schedule data is inconsistent'],
  )
  addDay(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CreateItineraryDayDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.addDay(id, dto, user);
  }

  @Post(':id/days/:dayOrder/activities')
  @ApiOperation({
    summary: 'ITN-10: Add an activity to an itinerary day',
    description: 'Activity title is its name. Optional cost currencies must exist in seeded Reference data. Images are retained separately and are not uploaded by this endpoint.',
  })
  @ApiParam({ name: 'dayOrder', description: 'Positive 1-based day number.', schema: { type: 'integer', minimum: 1 } })
  @ApiBody({ type: CreateItineraryActivityDto })
  @ApiCreatedResponse({ type: ItineraryResponseDto })
  @ApiErrors(400, 401, 403, [404, 'Itinerary, day, or currency reference not found'])
  createActivity(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayOrder', ParseIntPipe) dayOrder: number,
    @Body() dto: CreateItineraryActivityDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.createActivity(id, dayOrder, dto, user);
  }

  @Patch(':id/days/:dayOrder/activities/:activityId')
  @ApiOperation({
    summary: 'ITN-10: Edit an itinerary day activity',
    description: 'Only supplied fields change. The activity ID, images, and other omitted fields are preserved.',
  })
  @ApiParam({ name: 'dayOrder', description: 'Positive 1-based day number.', schema: { type: 'integer', minimum: 1 } })
  @ApiParam({ name: 'activityId', description: 'Generated MongoDB activity subdocument ID.' })
  @ApiBody({ type: UpdateItineraryActivityDto })
  @ApiOkResponse({ type: ItineraryResponseDto })
  @ApiErrors(400, 401, 403, [404, 'Itinerary, day, activity, or currency reference not found'])
  updateActivity(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayOrder', ParseIntPipe) dayOrder: number,
    @Param('activityId', ParseObjectIdPipe) activityId: string,
    @Body() dto: UpdateItineraryActivityDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.updateActivity(id, dayOrder, activityId, dto, user);
  }

  @Delete(':id/days/:dayOrder/activities/:activityId')
  @ApiOperation({ summary: 'ITN-10: Delete an itinerary day activity' })
  @ApiParam({ name: 'dayOrder', description: 'Positive 1-based day number.', schema: { type: 'integer', minimum: 1 } })
  @ApiParam({ name: 'activityId', description: 'Generated MongoDB activity subdocument ID.' })
  @ApiOkResponse({ type: ItineraryResponseDto })
  @ApiErrors(400, 401, 403, [404, 'Itinerary, day, or activity not found'])
  deleteActivity(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayOrder', ParseIntPipe) dayOrder: number,
    @Param('activityId', ParseObjectIdPipe) activityId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.deleteActivity(id, dayOrder, activityId, user);
  }

  @Post(':id/days/:dayOrder/activities/:activityId/images')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'ITN-12, GEN-08: Attach a JPG/PNG image to an activity (max 5)' })
  @ApiParam({ name: 'dayOrder', description: 'Positive 1-based day number.', schema: { type: 'integer', minimum: 1 } })
  @ApiParam({ name: 'activityId', description: 'Generated MongoDB activity subdocument ID.' })
  @ApiOkResponse({ description: 'Upload id/url plus the updated itinerary.' })
  @ApiErrors(400, 401, 403, [404, 'Itinerary, day, or activity not found'])
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  addActivityImage(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayOrder', ParseIntPipe) dayOrder: number,
    @Param('activityId', ParseObjectIdPipe) activityId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtUser,
  ) {
    if (!file) throw new BadRequestException('Choose a JPG or PNG image');
    return this.itinerariesService.addActivityImage(id, dayOrder, activityId, file, user);
  }

  @Delete(':id/days/:dayOrder/activities/:activityId/images/:imageId')
  @ApiOperation({ summary: 'ITN-12: Remove an image from an activity' })
  @ApiParam({ name: 'dayOrder', description: 'Positive 1-based day number.', schema: { type: 'integer', minimum: 1 } })
  @ApiParam({ name: 'activityId', description: 'Generated MongoDB activity subdocument ID.' })
  @ApiParam({ name: 'imageId', description: 'Upload ObjectId returned when the image was attached.' })
  @ApiOkResponse({ description: 'Deletion confirmation plus the updated itinerary.' })
  @ApiErrors(400, 401, 403, [404, 'Itinerary, day, activity, or image not found'])
  removeActivityImage(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayOrder', ParseIntPipe) dayOrder: number,
    @Param('activityId', ParseObjectIdPipe) activityId: string,
    @Param('imageId', ParseObjectIdPipe) imageId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.removeActivityImage(id, dayOrder, activityId, imageId, user);
  }

  @Patch(':id/days/:dayOrder')
  @ApiOperation({
    summary: 'ITN-05: Edit an itinerary day city or notes',
    description:
      'Only cityId and notes are editable here. Existing activities, images, legacy city text, order and date are preserved.',
  })
  @ApiParam({ name: 'dayOrder', description: 'Positive 1-based day number.', schema: { type: 'integer', minimum: 1 } })
  @ApiOkResponse({ type: ItineraryResponseDto })
  @ApiErrors(400, 401, 403, [404, 'Itinerary, day, or city reference not found'])
  updateDay(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayOrder', ParseIntPipe) dayOrder: number,
    @Body() dto: UpdateItineraryDayDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.updateDay(id, dayOrder, dto, user);
  }

  @Delete(':id/days/:dayOrder')
  @ApiOperation({
    summary: 'ITN-07: Delete an itinerary day after confirmation',
    description:
      'Send { confirmed: true }. Remaining original day objects are preserved; only their order and UTC date-only dates are recalculated. Top-level budgetEntries are preserved.',
  })
  @ApiParam({ name: 'dayOrder', description: 'Positive 1-based day number.', schema: { type: 'integer', minimum: 1 } })
  @ApiOkResponse({ type: ItineraryResponseDto })
  @ApiErrors(
    400,
    401,
    403,
    [404, 'Itinerary or day not found'],
    [409, 'Stored itinerary schedule data is inconsistent'],
  )
  deleteDay(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayOrder', ParseIntPipe) dayOrder: number,
    @Body() confirmation: ConfirmDayDeletionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.deleteDay(id, dayOrder, confirmation, user);
  }

  @Post(':id/days/:dayOrder/move')
  @ApiOperation({
    summary: 'ITN-08: Move an itinerary day to a new position',
    description:
      'newDayOrder is the final 1-based position. The original day object moves with all nested and legacy data; the backend recalculates order and UTC date-only dates.',
  })
  @ApiParam({ name: 'dayOrder', description: 'Positive 1-based day number.', schema: { type: 'integer', minimum: 1 } })
  @ApiCreatedResponse({ type: ItineraryResponseDto })
  @ApiErrors(400, 401, 403, [404, 'Itinerary or day not found'], [409, 'Stored day ordering is invalid'])
  moveDay(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayOrder', ParseIntPipe) dayOrder: number,
    @Body() dto: MoveItineraryDayDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.moveDay(id, dayOrder, dto, user);
  }

  @Post(':id/days/:dayOrder/budget-entries')
  @ApiOperation({
    summary: 'ITN-14: Add a budget entry to an itinerary day',
    description: 'Currency must be a supported seeded currency. This endpoint stores the entry and does not calculate totals.',
  })
  @ApiParam({ name: 'dayOrder', description: 'Positive 1-based day number.', schema: { type: 'integer', minimum: 1 } })
  @ApiBody({ type: CreateDayBudgetEntryDto })
  @ApiCreatedResponse({ type: ItineraryResponseDto })
  @ApiErrors(400, 401, 403, [404, 'Itinerary or day not found'])
  createDayBudgetEntry(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayOrder', ParseIntPipe) dayOrder: number,
    @Body() dto: CreateDayBudgetEntryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.createDayBudgetEntry(id, dayOrder, dto, user);
  }

  @Patch(':id/days/:dayOrder/budget-entries/:entryId')
  @ApiOperation({
    summary: 'ITN-14: Edit an itinerary day budget entry',
    description: 'Only supplied fields are changed. Currency, when supplied, must be supported by seeded Reference data.',
  })
  @ApiParam({ name: 'dayOrder', description: 'Positive 1-based day number.', schema: { type: 'integer', minimum: 1 } })
  @ApiParam({ name: 'entryId', description: 'Generated MongoDB budget-entry subdocument ID.' })
  @ApiBody({ type: UpdateDayBudgetEntryDto })
  @ApiOkResponse({ type: ItineraryResponseDto })
  @ApiErrors(400, 401, 403, [404, 'Itinerary, day, or budget entry not found'])
  updateDayBudgetEntry(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayOrder', ParseIntPipe) dayOrder: number,
    @Param('entryId', ParseObjectIdPipe) entryId: string,
    @Body() dto: UpdateDayBudgetEntryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.updateDayBudgetEntry(id, dayOrder, entryId, dto, user);
  }

  @Delete(':id/days/:dayOrder/budget-entries/:entryId')
  @ApiOperation({ summary: 'ITN-14: Delete an itinerary day budget entry' })
  @ApiParam({ name: 'dayOrder', description: 'Positive 1-based day number.', schema: { type: 'integer', minimum: 1 } })
  @ApiParam({ name: 'entryId', description: 'Generated MongoDB budget-entry subdocument ID.' })
  @ApiOkResponse({ type: ItineraryResponseDto })
  @ApiErrors(400, 401, 403, [404, 'Itinerary, day, or budget entry not found'])
  deleteDayBudgetEntry(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayOrder', ParseIntPipe) dayOrder: number,
    @Param('entryId', ParseObjectIdPipe) entryId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.deleteDayBudgetEntry(id, dayOrder, entryId, user);
  }

  @Post(':id/days/:dayOrder/transport-entries')
  @ApiOperation({
    summary: 'ITN-16: Add an intercity transport cost to an itinerary day',
    description: 'Mode is a required nonblank string. Both cities and the currency must exist in seeded Reference data.',
  })
  @ApiParam({ name: 'dayOrder', description: 'Positive 1-based day number.', schema: { type: 'integer', minimum: 1 } })
  @ApiBody({ type: CreateIntercityTransportEntryDto })
  @ApiCreatedResponse({ type: ItineraryResponseDto })
  @ApiErrors(400, 401, 403, [404, 'Itinerary, day, or city reference not found'])
  createDayTransportEntry(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayOrder', ParseIntPipe) dayOrder: number,
    @Body() dto: CreateIntercityTransportEntryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.createDayTransportEntry(id, dayOrder, dto, user);
  }

  @Patch(':id/days/:dayOrder/transport-entries/:entryId')
  @ApiOperation({
    summary: 'ITN-16: Edit an intercity transport entry',
    description: 'Only supplied fields change. When either city changes, the merged origin/destination pair and both seeded city references are validated.',
  })
  @ApiParam({ name: 'dayOrder', description: 'Positive 1-based day number.', schema: { type: 'integer', minimum: 1 } })
  @ApiParam({ name: 'entryId', description: 'Generated MongoDB transport-entry subdocument ID.' })
  @ApiBody({ type: UpdateIntercityTransportEntryDto })
  @ApiOkResponse({ type: ItineraryResponseDto })
  @ApiErrors(400, 401, 403, [404, 'Itinerary, day, entry, or city reference not found'])
  updateDayTransportEntry(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayOrder', ParseIntPipe) dayOrder: number,
    @Param('entryId', ParseObjectIdPipe) entryId: string,
    @Body() dto: UpdateIntercityTransportEntryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.updateDayTransportEntry(id, dayOrder, entryId, dto, user);
  }

  @Delete(':id/days/:dayOrder/transport-entries/:entryId')
  @ApiOperation({ summary: 'ITN-16: Delete an intercity transport entry' })
  @ApiParam({ name: 'dayOrder', description: 'Positive 1-based day number.', schema: { type: 'integer', minimum: 1 } })
  @ApiParam({ name: 'entryId', description: 'Generated MongoDB transport-entry subdocument ID.' })
  @ApiOkResponse({ type: ItineraryResponseDto })
  @ApiErrors(400, 401, 403, [404, 'Itinerary, day, or transport entry not found'])
  deleteDayTransportEntry(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('dayOrder', ParseIntPipe) dayOrder: number,
    @Param('entryId', ParseObjectIdPipe) entryId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.deleteDayTransportEntry(id, dayOrder, entryId, user);
  }

  @Put(':id/days')
  @ApiOperation({
    summary: 'ITN-05: Replace itinerary days; dates and numbering are server-derived',
    description:
      'Array order determines sequential day order. The backend derives each date from startDate at UTC midnight. Activity cost currencies must be supported seeded currencies. This replacement route returns 409 when legacy city text cannot be identified safely after reordering, or when any day has day-linked budgetEntries, transportEntries, or booking associations; use individual day operations instead.',
  })
  @ApiOkResponse({ type: ItineraryResponseDto })
  @ApiErrors(400, 401, 403, [404, 'Itinerary not found'], [409, 'Legacy city data, day-linked budget entries, intercity transport entries, or flight booking associations prevent safe bulk replacement'])
  updateDays(
    @Param('id') id: string,
    @Body() updateDto: UpdateItineraryDaysDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.updateDays(
      id,
      updateDto,
      user,
    );
  }

  @Get(':id/budget')
  @ApiExtraModels(
    ItineraryBudgetConversionAvailableDto,
    ItineraryBudgetConversionUnavailableDto,
  )
  @ApiOperation({
    summary: 'ITN-14: Get an owned itinerary budget summary',
    description: 'Returns raw totals by currency, category, day, and consecutive canonical-city group, plus a conversion into the current user’s supported preferred currency using the latest cached USD-base snapshot. Conversion is unavailable without partial totals when a preference or required rate is unavailable. Budget requests do not trigger provider requests; no totals are persisted.',
  })
  @ApiOkResponse({ type: ItineraryBudgetSummaryDto })
  @ApiErrors(400, 401, 403, [404, 'Itinerary not found'])
  getBudgetSummary(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.getBudgetSummary(id, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ITN-03: Get an owned itinerary with full details' })
  @ApiErrors(400, 401, 403, [404, 'Itinerary not found'])
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.itinerariesService.findOne(id, user);
  }
}
