import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isMongoId } from 'class-validator';
import { Model, Types } from 'mongoose';
import { HotelSearchDto } from './dto/hotel-search.dto.js';
import {
  CreateHotelRoomDto,
  UpdateHotelPolicyDto,
  UpdateHotelRoomDto,
  UpdateRoomAvailabilityDto,
} from './dto/hotel-room.dto.js';
import { CreateHotelDto } from './dto/create-hotel.dto.js';
import { UpdateHotelDto } from './dto/update-hotel.dto.js';
import { Hotel, HotelStatus } from './entities/hotel.entity.js';
import {
  HotelRoom,
  RoomReservationStatus,
} from './entities/hotel-room.entity.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException(`Invalid date: ${value}`);
  }
  return date;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function activeReservationFilter(now: Date) {
  return {
    $or: [
      { status: RoomReservationStatus.CONFIRMED },
      {
        status: RoomReservationStatus.PENDING_PAYMENT,
        expiresAt: { $gt: now },
      },
    ],
  };
}

@Injectable()
export class HotelsService {
  constructor(
    @InjectModel(Hotel.name)
    private readonly hotelModel: Model<Hotel>,
    @InjectModel(HotelRoom.name)
    private readonly roomModel: Model<HotelRoom>,
  ) {}

  create(createHotelDto: CreateHotelDto) {
    return this.hotelModel.create(createHotelDto);
  }

  findAll() {
    return this.hotelModel
      .find({ status: { $ne: HotelStatus.INACTIVE } })
      .exec();
  }

  async search(query: HotelSearchDto) {
    if (Boolean(query.checkIn) !== Boolean(query.checkOut)) {
      throw new BadRequestException('Both checkIn and checkOut are required');
    }

    const checkIn = query.checkIn ? parseDate(query.checkIn) : undefined;
    const checkOut = query.checkOut ? parseDate(query.checkOut) : undefined;
    if (checkIn && checkOut && checkOut <= checkIn) {
      throw new BadRequestException('checkOut must be after checkIn');
    }
    if (query.sortBy === 'price' && !query.currency) {
      throw new BadRequestException('currency is required to sort by price');
    }

    const hotelFilter: Record<string, unknown> = {
      status: { $ne: HotelStatus.INACTIVE },
    };
    if (query.city)
      hotelFilter.city = new RegExp(escapeRegex(query.city.trim()), 'i');
    if (query.country)
      hotelFilter.country = new RegExp(escapeRegex(query.country.trim()), 'i');
    if (query.amenity)
      hotelFilter.amenities = new RegExp(
        escapeRegex(query.amenity.trim()),
        'i',
      );
    if (query.minStarRating)
      hotelFilter.starRating = { $gte: query.minStarRating };

    const hotels = await this.hotelModel.find(hotelFilter).exec();
    const now = new Date();
    const availableHotels = await Promise.all(
      hotels.map(async (hotel) => {
        const roomFilter: Record<string, unknown> = {
          hotelId: hotel._id,
          isActive: true,
          maxOccupancy: { $gte: query.guests },
        };
        if (query.currency) roomFilter.currency = query.currency.toUpperCase();
        if (query.maxPricePerNight) {
          roomFilter.pricePerNight = { $lte: query.maxPricePerNight };
        }
        if (checkIn && checkOut) {
          roomFilter.blockedDates = {
            $not: {
              $elemMatch: {
                $gte: query.checkIn,
                $lt: query.checkOut,
              },
            },
          };
          roomFilter.reservations = {
            $not: {
              $elemMatch: {
                checkIn: { $lt: checkOut },
                checkOut: { $gt: checkIn },
                ...activeReservationFilter(now),
              },
            },
          };
        }
        const rooms = await this.roomModel.find(roomFilter).exec();
        if (checkIn && checkOut && rooms.length === 0) return null;
        const pricedRooms = query.currency
          ? rooms
          : rooms.filter((room) => room.currency === rooms[0]?.currency);
        const lowestPrice = pricedRooms.reduce<number | undefined>(
          (lowest, room) =>
            lowest === undefined || room.pricePerNight < lowest
              ? room.pricePerNight
              : lowest,
          undefined,
        );
        return Object.assign(hotel.toObject(), {
          availableRoomCount: rooms.length,
          lowestPricePerNight: lowestPrice,
          currency: pricedRooms[0]?.currency,
        });
      }),
    );

    let results = availableHotels.filter((hotel) => hotel !== null);
    const direction = query.sortOrder === 'desc' ? -1 : 1;
    results = results.sort((left, right) => {
      const a =
        query.sortBy === 'rating'
          ? left.averageReviewRating
          : query.sortBy === 'price'
            ? (left.lowestPricePerNight ?? Number.MAX_SAFE_INTEGER)
            : left.name.toLocaleLowerCase();
      const b =
        query.sortBy === 'rating'
          ? right.averageReviewRating
          : query.sortBy === 'price'
            ? (right.lowestPricePerNight ?? Number.MAX_SAFE_INTEGER)
            : right.name.toLocaleLowerCase();
      return (a < b ? -1 : a > b ? 1 : 0) * direction;
    });

    const total = results.length;
    const offset = (query.page - 1) * query.limit;
    return {
      data: results.slice(offset, offset + query.limit),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async findOne(id: string) {
    this.validateId(id);
    const hotel = await this.hotelModel.findById(id).exec();
    if (!hotel || hotel.status === HotelStatus.INACTIVE) {
      throw new NotFoundException('Hotel not found');
    }
    return hotel;
  }

  async update(id: string, updateHotelDto: UpdateHotelDto) {
    this.validateId(id);
    const hotel = await this.hotelModel
      .findOneAndUpdate(
        { _id: id, status: { $ne: HotelStatus.INACTIVE } },
        { $set: updateHotelDto },
        { new: true, runValidators: true },
      )
      .exec();
    if (!hotel) throw new NotFoundException('Hotel not found');
    return hotel;
  }

  async addRoom(hotelId: string, dto: CreateHotelRoomDto) {
    await this.findOne(hotelId);
    return this.roomModel.create(
      Object.assign({}, dto, {
        hotelId: new Types.ObjectId(hotelId),
        currency: dto.currency.toUpperCase(),
      }),
    );
  }

  async updateRoom(hotelId: string, roomId: string, dto: UpdateHotelRoomDto) {
    this.validateId(roomId);
    const room = await this.roomModel
      .findOneAndUpdate(
        {
          _id: roomId,
          hotelId,
          reservations: {
            $not: { $elemMatch: activeReservationFilter(new Date()) },
          },
        },
        {
          $set: Object.assign(
            {},
            dto,
            dto.currency ? { currency: dto.currency.toUpperCase() } : {},
          ),
        },
        { new: true, runValidators: true },
      )
      .exec();
    if (!room) {
      const exists = await this.roomModel.exists({ _id: roomId, hotelId });
      if (!exists) throw new NotFoundException('Room not found');
      throw new ConflictException(
        'A room with active reservations cannot be modified',
      );
    }
    return room;
  }

  async removeRoom(hotelId: string, roomId: string) {
    this.validateId(roomId);
    const room = await this.roomModel
      .findOneAndDelete({
        _id: roomId,
        hotelId,
        reservations: {
          $not: { $elemMatch: activeReservationFilter(new Date()) },
        },
      })
      .exec();
    if (!room) {
      const exists = await this.roomModel.exists({ _id: roomId, hotelId });
      if (!exists) throw new NotFoundException('Room not found');
      throw new ConflictException(
        'A room with active reservations cannot be deleted',
      );
    }
    return { message: 'Room deleted successfully' };
  }

  async getRooms(hotelId: string) {
    await this.findOne(hotelId);
    return this.roomModel
      .find({ hotelId, isActive: true })
      .select('-reservations')
      .exec();
  }

  async getAvailableRooms(
    hotelId: string,
    checkInValue: string,
    checkOutValue: string,
    guests: number,
  ) {
    await this.findOne(hotelId);
    const checkIn = parseDate(checkInValue);
    const checkOut = parseDate(checkOutValue);
    if (checkOut <= checkIn)
      throw new BadRequestException('checkOut must be after checkIn');
    return this.roomModel
      .find({
        hotelId,
        isActive: true,
        maxOccupancy: { $gte: guests },
        blockedDates: {
          $not: {
            $elemMatch: { $gte: checkInValue, $lt: checkOutValue },
          },
        },
        reservations: {
          $not: {
            $elemMatch: {
              checkIn: { $lt: checkOut },
              checkOut: { $gt: checkIn },
              ...activeReservationFilter(new Date()),
            },
          },
        },
      })
      .select('-reservations')
      .exec();
  }

  async getAvailability(hotelId: string) {
    await this.findOne(hotelId);
    const rooms = await this.roomModel
      .find({ hotelId, isActive: true })
      .select('name blockedDates reservations')
      .exec();
    return rooms.map((room) => ({
      _id: room._id,
      name: room.name,
      blockedDates: room.blockedDates,
      reservations: room.reservations
        .filter(
          (reservation) =>
            reservation.status === RoomReservationStatus.CONFIRMED ||
            reservation.expiresAt > new Date(),
        )
        .map(({ checkIn, checkOut, status }) => ({
          checkIn,
          checkOut,
          status,
        })),
    }));
  }

  async updateAvailability(
    hotelId: string,
    roomId: string,
    dto: UpdateRoomAvailabilityDto,
  ) {
    this.validateId(roomId);
    const blockedDates = dto.blockedDates ?? [];
    const unblockedDates = dto.unblockedDates ?? [];
    if (!blockedDates.length && !unblockedDates.length) {
      throw new BadRequestException('Provide dates to block or unblock');
    }
    const days = [...new Set([...blockedDates, ...unblockedDates])];
    for (const day of days) parseDate(day);
    if (blockedDates.some((day) => unblockedDates.includes(day))) {
      throw new BadRequestException(
        'A date cannot be blocked and unblocked together',
      );
    }

    const session = await this.roomModel.db.startSession();
    try {
      let updated: HotelRoom | null = null;
      await session.withTransaction(async () => {
        const room = await this.roomModel
          .findOne({ _id: roomId, hotelId })
          .session(session)
          .exec();
        if (!room) throw new NotFoundException('Room not found');

        const now = new Date();
        for (const day of blockedDates) {
          const start = parseDate(day);
          const end = new Date(start.getTime() + DAY_MS);
          const result = await this.roomModel
            .findOneAndUpdate(
              {
                _id: roomId,
                hotelId,
                reservations: {
                  $not: {
                    $elemMatch: {
                      checkIn: { $lt: end },
                      checkOut: { $gt: start },
                      ...activeReservationFilter(now),
                    },
                  },
                },
              },
              { $addToSet: { blockedDates: day } },
              { new: true, session },
            )
            .exec();
          if (!result) {
            throw new ConflictException(
              `Cannot block ${day}; the room has an active reservation`,
            );
          }
          updated = result;
        }
        if (unblockedDates.length) {
          updated = await this.roomModel
            .findOneAndUpdate(
              { _id: roomId, hotelId },
              { $pull: { blockedDates: { $in: unblockedDates } } },
              { new: true, session },
            )
            .exec();
        }
      });
      if (!updated) throw new NotFoundException('Room not found');
      return updated;
    } finally {
      await session.endSession();
    }
  }

  async updatePolicy(hotelId: string, policy: UpdateHotelPolicyDto) {
    this.validateId(hotelId);
    const hotel = await this.hotelModel
      .findOneAndUpdate(
        { _id: hotelId, status: { $ne: HotelStatus.INACTIVE } },
        { $set: { policy } },
        { new: true, runValidators: true },
      )
      .exec();
    if (!hotel) throw new NotFoundException('Hotel not found');
    return hotel;
  }

  validateId(id: string) {
    if (!isMongoId(id)) throw new BadRequestException('Invalid ID');
  }
}
