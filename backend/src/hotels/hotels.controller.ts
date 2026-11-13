import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiErrors, CurrentUser, Public, Roles } from '../common/decorators.js';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe.js';
import { assertProvider } from '../common/guards.js';
import { Role } from '../common/roles.js';
import type { JwtUser } from '../common/roles.js';
import { HotelsService } from './hotels.service.js';
import { CreateHotelDto } from './dto/create-hotel.dto.js';
import { UpdateHotelDto } from './dto/update-hotel.dto.js';
import {
  CreateHotelRoomDto,
  RoomAvailabilityQueryDto,
  UpdateHotelPolicyDto,
  UpdateHotelRoomDto,
  UpdateRoomAvailabilityDto,
} from './dto/hotel-room.dto.js';
import { HotelSearchDto } from './dto/hotel-search.dto.js';

@Controller('hotels')
@ApiTags('Hotels')
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'HTL-11, HTL-12: search, filter and sort hotels' })
  @ApiErrors(400)
  search(@Query() query: HotelSearchDto) {
    return this.hotelsService.search(query);
  }

  @Roles(Role.ADMIN)
  @Post()
  @ApiOperation({ summary: 'HTL-01: create a hotel profile' })
  @ApiErrors(400, 401, 403)
  create(@Body() createHotelDto: CreateHotelDto) {
    return this.hotelsService.create(createHotelDto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'HTL-11: list active hotels' })
  findAll() {
    return this.hotelsService.findAll();
  }

  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'HTL-02, HTL-15, HTL-24: hotel details, rooms and reviews',
  })
  @ApiErrors(400, [404, 'Hotel not found'])
  findOne(
    @Param('id', ParseObjectIdPipe) id: string,
    @Query() query: HotelSearchDto,
  ) {
    return this.hotelsService.findDetail(id, query);
  }

  @Roles(Role.ADMIN, Role.HOTEL_MOD)
  @Patch(':id')
  @ApiOperation({ summary: 'HTL-01: update a hotel profile' })
  @ApiErrors(400, 401, 403, [404, 'Hotel not found'])
  async update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() updateHotelDto: UpdateHotelDto,
    @CurrentUser() user: JwtUser,
  ) {
    const hotel = await this.hotelsService.findOne(id);
    assertProvider(hotel._id, user);
    return this.hotelsService.update(id, updateHotelDto);
  }

  @Roles(Role.ADMIN, Role.HOTEL_MOD)
  @Post(':id/rooms')
  @ApiOperation({ summary: 'HTL-03: add an individually bookable room' })
  @ApiErrors(400, 401, 403, [404, 'Hotel not found'])
  async addRoom(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CreateHotelRoomDto,
    @CurrentUser() user: JwtUser,
  ) {
    const hotel = await this.hotelsService.findOne(id);
    assertProvider(hotel._id, user);
    return this.hotelsService.addRoom(id, dto);
  }

  @Roles(Role.ADMIN, Role.HOTEL_MOD)
  @Patch(':id/rooms/:roomId')
  @ApiOperation({ summary: 'HTL-05, HTL-06: update a room' })
  @ApiErrors(
    400,
    401,
    403,
    [404, 'Room or hotel not found'],
    [409, 'Room has active reservations'],
  )
  async updateRoom(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('roomId', ParseObjectIdPipe) roomId: string,
    @Body() dto: UpdateHotelRoomDto,
    @CurrentUser() user: JwtUser,
  ) {
    const hotel = await this.hotelsService.findOne(id);
    assertProvider(hotel._id, user);
    return this.hotelsService.updateRoom(id, roomId, dto);
  }

  @Roles(Role.ADMIN, Role.HOTEL_MOD)
  @Delete(':id/rooms/:roomId')
  @ApiOperation({ summary: 'HTL-06: delete a never-reserved room' })
  @ApiErrors(
    400,
    401,
    403,
    [404, 'Room or hotel not found'],
    [409, 'Room has active reservations'],
  )
  async removeRoom(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('roomId', ParseObjectIdPipe) roomId: string,
    @CurrentUser() user: JwtUser,
  ) {
    const hotel = await this.hotelsService.findOne(id);
    assertProvider(hotel._id, user);
    return this.hotelsService.removeRoom(id, roomId);
  }

  @Public()
  @Get(':id/rooms/available')
  @ApiOperation({
    summary: 'HTL-15: list available rooms and total stay prices',
  })
  @ApiQuery({ name: 'checkIn', type: String, format: 'date', required: true })
  @ApiQuery({ name: 'checkOut', type: String, format: 'date', required: true })
  @ApiErrors(400, [404, 'Hotel not found'])
  availableRooms(
    @Param('id', ParseObjectIdPipe) id: string,
    @Query('checkIn') checkIn: string,
    @Query('checkOut') checkOut: string,
  ) {
    return this.hotelsService.getAvailableRooms(id, checkIn, checkOut);
  }

  @Roles(Role.ADMIN, Role.HOTEL_MOD)
  @Post(':id/rooms/:roomId/availability')
  @ApiOperation({ summary: 'HTL-04, HTL-06: set room availability and blocks' })
  @ApiErrors(
    400,
    401,
    403,
    [404, 'Room or hotel not found'],
    [409, 'Room has an active reservation'],
  )
  async blockDates(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('roomId', ParseObjectIdPipe) roomId: string,
    @Body() dto: UpdateRoomAvailabilityDto,
    @CurrentUser() user: JwtUser,
  ) {
    const hotel = await this.hotelsService.findOne(id);
    assertProvider(hotel._id, user);
    return this.hotelsService.updateAvailability(id, roomId, {
      blockedDates: dto.blockedDates,
    });
  }

  @Roles(Role.ADMIN, Role.HOTEL_MOD)
  @Patch(':id/rooms/:roomId/availability')
  @ApiOperation({ summary: 'HTL-04, HTL-05: edit availability and blocks' })
  @ApiErrors(
    400,
    401,
    403,
    [404, 'Room or hotel not found'],
    [409, 'Room has an active reservation'],
  )
  async updateAvailability(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('roomId', ParseObjectIdPipe) roomId: string,
    @Body() dto: UpdateRoomAvailabilityDto,
    @CurrentUser() user: JwtUser,
  ) {
    const hotel = await this.hotelsService.findOne(id);
    assertProvider(hotel._id, user);
    return this.hotelsService.updateAvailability(id, roomId, dto);
  }

  @Roles(Role.ADMIN, Role.HOTEL_MOD)
  @Get(':id/availability')
  @ApiOperation({ summary: 'HTL-08: view room status over a date range' })
  @ApiErrors(401, 403, [404, 'Hotel not found'])
  async getAvailability(
    @Param('id', ParseObjectIdPipe) id: string,
    @Query() query: RoomAvailabilityQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    const hotel = await this.hotelsService.findOne(id);
    assertProvider(hotel._id, user);
    return this.hotelsService.getAvailability(id, query);
  }

  @Roles(Role.ADMIN, Role.HOTEL_MOD)
  @Put(':id/policies')
  @ApiOperation({
    summary: 'HTL-09, HTL-10: set hotel times and cancellation tiers',
  })
  @ApiErrors(400, 401, 403, [404, 'Hotel not found'])
  async updatePolicy(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateHotelPolicyDto,
    @CurrentUser() user: JwtUser,
  ) {
    const hotel = await this.hotelsService.findOne(id);
    assertProvider(hotel._id, user);
    return this.hotelsService.updatePolicy(id, dto);
  }
}
