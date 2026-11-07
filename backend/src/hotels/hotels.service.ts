import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isMongoId } from 'class-validator';
import { Model, Types } from 'mongoose';
import { Review } from '../reviews/entities/review.entity.js';
import { HotelSearchDto } from './dto/hotel-search.dto.js';
import {
  CreateHotelRoomDto,
  RoomAvailabilityQueryDto,
  RoomAvailabilityRangeDto,
  UpdateHotelPolicyDto,
  UpdateHotelRoomDto,
  UpdateRoomAvailabilityDto,
} from './dto/hotel-room.dto.js';
import { CreateHotelDto } from './dto/create-hotel.dto.js';
import { UpdateHotelDto } from './dto/update-hotel.dto.js';
import { Hotel, HotelStatus } from './entities/hotel.entity.js';
import {
  HotelRoom,
  HotelRoomDocument,
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

function isActiveReservation(
  reservation: HotelRoom['reservations'][number],
  now: Date,
): boolean {
  return (
    reservation.status === RoomReservationStatus.CONFIRMED ||
    (reservation.status === RoomReservationStatus.PENDING_PAYMENT &&
      reservation.expiresAt > now)
  );
}

function dateRangeCovers(
  room: HotelRoom,
  checkIn: string,
  checkOut: string,
  now: Date,
): boolean {
  const isInBookableRange = room.availabilityRanges.some(
    (range) => range.startDate <= checkIn && range.endDate >= checkOut,
  );
  if (!isInBookableRange) return false;
  if (
    room.blockedDates.some((day) => day >= checkIn && day < checkOut)
  ) {
    return false;
  }
  return !room.reservations.some(
    (reservation) =>
      reservation.checkIn < parseDate(checkOut) &&
      reservation.checkOut > parseDate(checkIn) &&
      isActiveReservation(reservation, now),
  );
}

function chooseRoomSet(
  rooms: HotelRoomDocument[],
  roomCount: number,
  guests: number,
): HotelRoomDocument[] | undefined {
  const states = new Map<
    string,
    {
      count: number;
      capacity: number;
      total: number;
      rooms: HotelRoomDocument[];
    }
  >([['0:0', { count: 0, capacity: 0, total: 0, rooms: [] }]]);
  for (const room of rooms) {
    const previousStates = Array.from(states.values());
    for (const state of previousStates) {
      if (state.count >= roomCount) continue;
      const count = state.count + 1;
      const capacity = Math.min(guests, state.capacity + room.maxOccupancy);
      const key = `${count}:${capacity}`;
      const total = state.total + room.pricePerNight;
      const existing = states.get(key);
      if (!existing || total < existing.total) {
        states.set(key, {
          count,
          capacity,
          total,
          rooms: [...state.rooms, room],
        });
      }
    }
  }
  return states.get(`${roomCount}:${guests}`)?.rooms;
}

@Injectable()
export class HotelsService {
  constructor(
    @InjectModel(Hotel.name)
    private readonly hotelModel: Model<Hotel>,
    @InjectModel(HotelRoom.name)
    private readonly roomModel: Model<HotelRoom>,
    @InjectModel(Review.name)
    private readonly reviewModel: Model<Review>,
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
    if (checkIn && checkIn < parseDate(new Date().toISOString().slice(0, 10))) {
      throw new BadRequestException('checkIn cannot be in the past');
    }
    if (
      query.minPricePerNight !== undefined &&
      query.maxPricePerNight !== undefined &&
      query.minPricePerNight > query.maxPricePerNight
    ) {
      throw new BadRequestException(
        'minPricePerNight cannot exceed maxPricePerNight',
      );
    }
    if (
      (query.sortBy === 'price' ||
        query.minPricePerNight !== undefined ||
        query.maxPricePerNight !== undefined) &&
      !query.currency
    ) {
      throw new BadRequestException('currency is required for price filters');
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
    if (query.minRating)
      hotelFilter.averageReviewRating = { $gte: query.minRating };

    const hotels = await this.hotelModel.find(hotelFilter).exec();
    const now = new Date();
    const availableHotels = await Promise.all(
      hotels.map(async (hotel) => {
        const roomFilter: Record<string, unknown> = {
          hotelId: hotel._id,
          isActive: true,
        };
        if (query.currency) roomFilter.currency = query.currency.toUpperCase();
        const rooms = await this.roomModel.find(roomFilter).exec();
        const freeRooms =
          checkIn && checkOut
            ? rooms.filter((room) =>
                dateRangeCovers(room, query.checkIn!, query.checkOut!, now),
              )
            : rooms;
        const currencyRooms = query.currency
          ? freeRooms
          : freeRooms.filter(
              (room) => room.currency === freeRooms[0]?.currency,
            );
        const priceQualifiedRooms = currencyRooms.filter(
          (room) =>
            (query.minPricePerNight === undefined ||
              room.pricePerNight >= query.minPricePerNight) &&
            (query.maxPricePerNight === undefined ||
              room.pricePerNight <= query.maxPricePerNight),
        );
        const lowestPrice = priceQualifiedRooms.reduce<number | undefined>(
          (lowest, room) =>
            lowest === undefined || room.pricePerNight < lowest
              ? room.pricePerNight
              : lowest,
          undefined,
        );
        const combinedRooms = chooseRoomSet(
          priceQualifiedRooms,
          query.rooms,
          query.guests,
        );
        if (!combinedRooms) return null;
        return Object.assign(hotel.toObject(), {
          availableRoomCount: freeRooms.length,
          selectedRooms: combinedRooms.map((room) => room._id),
          lowestPricePerNight: lowestPrice,
          currency: currencyRooms[0]?.currency,
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
    await this.assertPlatformCurrency(dto.currency);
    return this.roomModel.create(
      Object.assign({}, dto, {
        hotelId: new Types.ObjectId(hotelId),
        currency: dto.currency.toUpperCase(),
      }),
    );
  }

  async updateRoom(hotelId: string, roomId: string, dto: UpdateHotelRoomDto) {
    this.validateId(roomId);
    if (dto.currency) await this.assertPlatformCurrency(dto.currency);
    const current = await this.roomModel
      .findOne({ _id: roomId, hotelId })
      .exec();
    if (!current) throw new NotFoundException('Room not found');
    if (
      current.reservations.some((reservation) =>
        isActiveReservation(reservation, new Date()),
      )
    ) {
      if (dto.isActive === false) {
        throw new ConflictException(
          'A room with active reservations cannot be deactivated',
        );
      }
      if (
        dto.maxOccupancy !== undefined &&
        current.reservations.some(
          (reservation) =>
            isActiveReservation(reservation, new Date()) &&
            reservation.adults + reservation.childrenAges.length >
              dto.maxOccupancy!,
        )
      ) {
        throw new ConflictException(
          'Room occupancy cannot be reduced below an active reservation',
        );
      }
    }
    const room = await this.roomModel
      .findOneAndUpdate(
        {
          _id: roomId,
          hotelId,
          ...(dto.isActive === false
            ? {
                reservations: {
                  $not: {
                    $elemMatch: activeReservationFilter(new Date()),
                  },
                },
              }
            : {}),
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
        everReserved: false,
        reservations: {
          $not: { $elemMatch: activeReservationFilter(new Date()) },
        },
      })
      .exec();
    if (!room) {
      const exists = await this.roomModel.exists({ _id: roomId, hotelId });
      if (!exists) throw new NotFoundException('Room not found');
      throw new ConflictException(
        'A room that has been reserved cannot be deleted; deactivate it instead',
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
    const rooms = await this.roomModel
      .find({
        hotelId,
        isActive: true,
      })
      .select('-reservations')
      .exec();
    return rooms
      .filter(
        (room) =>
          room.maxOccupancy >= guests &&
          dateRangeCovers(room, checkInValue, checkOutValue, new Date()),
      )
      .map((room) =>
        Object.assign(room.toObject(), {
          totalStayPrice:
          (room.pricePerNight * (checkOut.getTime() - checkIn.getTime())) /
          DAY_MS,
        }),
      );
  }

  async getAvailability(hotelId: string, query: RoomAvailabilityQueryDto) {
    await this.findOne(hotelId);
    const checkIn = parseDate(query.checkIn);
    const checkOut = parseDate(query.checkOut);
    if (checkOut <= checkIn) {
      throw new BadRequestException('checkOut must be after checkIn');
    }
    const nights = (checkOut.getTime() - checkIn.getTime()) / DAY_MS;
    if (nights > 365) {
      throw new BadRequestException('Availability range cannot exceed 365 days');
    }
    const rooms = await this.roomModel
      .find({ hotelId, isActive: true })
      .select('name availabilityRanges blockedDates reservations')
      .exec();
    const now = new Date();
    return rooms.map((room) => {
      const dates = [];
      for (let dayOffset = 0; dayOffset < nights; dayOffset += 1) {
        const day = new Date(checkIn.getTime() + dayOffset * DAY_MS);
        const nextDay = new Date(day.getTime() + DAY_MS);
        const date = day.toISOString().slice(0, 10);
        const nextDate = nextDay.toISOString().slice(0, 10);
        const reservation = room.reservations.find(
          (item) =>
            item.checkIn < nextDay &&
            item.checkOut > day &&
            (item.status === RoomReservationStatus.CONFIRMED ||
              (item.status === RoomReservationStatus.PENDING_PAYMENT &&
                item.expiresAt > now)),
        );
        const bookable = room.availabilityRanges.some(
          (range) =>
            range.startDate <= date && range.endDate >= nextDate,
        );
        dates.push(
          reservation
            ? {
                date,
                status: 'Booked',
                ...(reservation.reference
                  ? { reference: reservation.reference }
                  : {}),
              }
            : {
                date,
                status:
                  !bookable || room.blockedDates.includes(date)
                    ? 'Blocked'
                    : 'Available',
              },
        );
      }
      return { roomId: room._id, roomName: room.name, dates };
    });
  }

  async updateAvailability(
    hotelId: string,
    roomId: string,
    dto: UpdateRoomAvailabilityDto,
  ) {
    this.validateId(roomId);
    const blockedDates = dto.blockedDates ?? [];
    const unblockedDates = dto.unblockedDates ?? [];
    const availabilityRanges = dto.availabilityRanges;
    if (
      !blockedDates.length &&
      !unblockedDates.length &&
      !availabilityRanges
    ) {
      throw new BadRequestException('Provide dates to block or unblock');
    }
    if (availabilityRanges) this.validateAvailabilityRanges(availabilityRanges);
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
        if (
          availabilityRanges &&
          room.reservations.some((reservation) => {
            if (!isActiveReservation(reservation, now)) return false;
            const startDate = reservation.checkIn.toISOString().slice(0, 10);
            const endDate = reservation.checkOut.toISOString().slice(0, 10);
            return !availabilityRanges.some(
              (range) =>
                range.startDate <= startDate && range.endDate >= endDate,
            );
          })
        ) {
          throw new ConflictException(
            'Availability cannot be removed for dates with active reservations',
          );
        }
        if (availabilityRanges) {
          updated = await this.roomModel
            .findOneAndUpdate(
              { _id: roomId, hotelId },
              { $set: { availabilityRanges } },
              { new: true, session },
            )
            .exec();
        }
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

  async findDetail(
    id: string,
    query: Pick<HotelSearchDto, 'checkIn' | 'checkOut' | 'guests'>,
  ) {
    const hotel = await this.findOne(id);
    if (Boolean(query.checkIn) !== Boolean(query.checkOut)) {
      throw new BadRequestException('Both checkIn and checkOut are required');
    }
    const rooms =
      query.checkIn && query.checkOut
        ? await this.getAvailableRooms(
        id,
        query.checkIn,
        query.checkOut,
        query.guests,
          )
        : await this.getRooms(id);
    const reviews = await this.reviewModel
      .find({ hotelId: id })
      .select('rating comment createdAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .exec();
    return Object.assign(hotel.toObject(), { rooms, reviews });
  }

  private validateAvailabilityRanges(ranges: RoomAvailabilityRangeDto[]) {
    const sorted = ranges
      .map((range) => ({
        startDate: parseDate(range.startDate),
        endDate: parseDate(range.endDate),
        range,
      }))
      .sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
    for (const { startDate, endDate } of sorted) {
      if (endDate <= startDate) {
        throw new BadRequestException(
          'Availability range endDate must be after startDate',
        );
      }
    }
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index].startDate < sorted[index - 1].endDate) {
        throw new BadRequestException('Availability date ranges cannot overlap');
      }
    }
    return sorted.map(({ range }) => range);
  }

  private async assertPlatformCurrency(currency: string) {
    const platformCurrency = (process.env.PLATFORM_CURRENCY ?? 'USD').toUpperCase();
    if (currency.toUpperCase() !== platformCurrency) {
      throw new BadRequestException(
        `Hotel room prices must use platform currency ${platformCurrency}`,
      );
    }
  }

  validateId(id: string) {
    if (!isMongoId(id)) throw new BadRequestException('Invalid ID');
  }
}
