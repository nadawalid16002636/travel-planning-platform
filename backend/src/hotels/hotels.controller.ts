import {
  BadRequestException,
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
import { ApiQuery } from '@nestjs/swagger';
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
  UpdateHotelPolicyDto,
  UpdateHotelRoomDto,
  UpdateRoomAvailabilityDto,
} from './dto/hotel-room.dto.js';
import { HotelSearchDto } from './dto/hotel-search.dto.js';

@Controller('hotels')
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Public()
  @Get('search')
  @ApiErrors(400)
  search(@Query() query: HotelSearchDto) {
    return this.hotelsService.search(query);
  }

  @Roles(Role.ADMIN)
  @Post()
  @ApiErrors(400, 401, 403)
  create(@Body() createHotelDto: CreateHotelDto) {
    return this.hotelsService.create(createHotelDto);
  }

  @Public()
  @Get()
  findAll() {
    return this.hotelsService.findAll();
  }

  @Public()
  @Get(':id')
  @ApiErrors([400, 'Invalid hotel ID'], [404, 'Hotel not found'])
  async findOne(@Param('id', ParseObjectIdPipe) id: string) {
    const hotel = await this.hotelsService.findOne(id);
    const rooms = await this.hotelsService.getRooms(id);
    return Object.assign(hotel.toObject(), { rooms });
  }

  @Roles(Role.ADMIN, Role.HOTEL_MOD)
  @Patch(':id')
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
  @ApiQuery({ name: 'checkIn', type: String, format: 'date', required: true })
  @ApiQuery({ name: 'checkOut', type: String, format: 'date', required: true })
  @ApiQuery({ name: 'guests', type: Number, minimum: 1, maximum: 20 })
  @ApiErrors(400, [404, 'Hotel not found'])
  availableRooms(
    @Param('id', ParseObjectIdPipe) id: string,
    @Query('checkIn') checkIn: string,
    @Query('checkOut') checkOut: string,
    @Query('guests') guests = '1',
  ) {
    const guestCount = Number(guests);
    if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 20) {
      throw new BadRequestException('guests must be an integer from 1 to 20');
    }
    return this.hotelsService.getAvailableRooms(
      id,
      checkIn,
      checkOut,
      guestCount,
    );
  }

  @Roles(Role.ADMIN, Role.HOTEL_MOD)
  @Post(':id/rooms/:roomId/availability')
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
  @ApiErrors(401, 403, [404, 'Hotel not found'])
  async getAvailability(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    const hotel = await this.hotelsService.findOne(id);
    assertProvider(hotel._id, user);
    return this.hotelsService.getAvailability(id);
  }

  @Roles(Role.ADMIN, Role.HOTEL_MOD)
  @Put(':id/policies')
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
