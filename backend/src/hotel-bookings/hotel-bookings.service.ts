import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { isMongoId } from 'class-validator';
import { Connection, Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentsService } from '../payments/payments.service.js';
import { assertOwner } from '../common/guards.js';
import { JwtUser } from '../common/roles.js';
import { Hotel, HotelStatus } from '../hotels/entities/hotel.entity.js';
import {
  HotelRoom,
  RoomReservationStatus,
} from '../hotels/entities/hotel-room.entity.js';
import {
  HotelBooking,
  HotelBookingDocument,
  HotelBookingStatus,
} from './entities/hotel-booking.entity.js';
import { CreateHotelBookingDto } from './dto/create-hotel-booking.dto.js';
import { HotelBookingQueryDto } from './dto/hotel-booking-query.dto.js';
import { Role } from '../common/roles.js';

const HOLD_MINUTES = 10;
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

function roomIsAvailable(
  room: HotelRoom,
  checkIn: string,
  checkOut: string,
  now: Date,
): boolean {
  return (
    room.availabilityRanges.some(
      (range) =>
        range.startDate <= checkIn && range.endDate >= checkOut,
    ) &&
    !room.blockedDates.some((day) => day >= checkIn && day < checkOut) &&
    !room.reservations.some(
      (reservation) =>
        reservation.checkIn < parseDate(checkOut) &&
        reservation.checkOut > parseDate(checkIn) &&
        (reservation.status === RoomReservationStatus.CONFIRMED ||
          (reservation.status === RoomReservationStatus.PENDING_PAYMENT &&
            reservation.expiresAt > now)),
    )
  );
}
@Injectable()
export class HotelBookingsService implements OnModuleInit {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(HotelBooking.name)
    private readonly bookingModel: Model<HotelBooking>,
    @InjectModel(Hotel.name)
    private readonly hotelModel: Model<Hotel>,
    @InjectModel(HotelRoom.name)
    private readonly roomModel: Model<HotelRoom>,
    private readonly payments: PaymentsService,
  ) {}

  onModuleInit() {
    this.payments.registerHandler('hotel', {
      confirm: (bookingId, paymentId) => this.confirm(bookingId, paymentId),
      fail: (bookingId) => this.fail(bookingId),
    });
  }

  async create(user: JwtUser, dto: CreateHotelBookingDto) {
    if (!dto.acceptPolicies) {
      throw new BadRequestException(
        'You must accept the hotel policies before booking',
      );
    }
    const checkIn = parseDate(dto.checkIn);
    const checkOut = parseDate(dto.checkOut);
    if (checkIn < new Date(new Date().toISOString().slice(0, 10))) {
      throw new BadRequestException('checkIn cannot be in the past');
    }
    if (checkOut <= checkIn)
      throw new BadRequestException('checkOut must be after checkIn');
    if (dto.rooms.reduce((sum, room) => sum + room.adults, 0) < 1) {
      throw new BadRequestException(
        'Each reservation must include at least one adult',
      );
    }

    const hotel = await this.hotelModel
      .findOne({ _id: dto.hotelId, status: { $ne: HotelStatus.INACTIVE } })
      .exec();
    if (!hotel) throw new NotFoundException('Hotel not found');
    const [checkInHour, checkInMinute] = (hotel.policy?.checkInTime ?? '15:00')
      .split(':')
      .map(Number);
    const arrivalAt = new Date(checkIn);
    arrivalAt.setUTCHours(checkInHour, checkInMinute, 0, 0);
    if (arrivalAt <= new Date()) {
      throw new BadRequestException('checkIn time has already passed');
    }
    let totalAmount = 0;
    let bookingRooms: Array<{
      roomId: Types.ObjectId;
      roomName: string;
      adults: number;
      childrenAges: number[];
      pricePerNight: number;
      currency: string;
    }> = [];
    const nights = Math.round(
      (checkOut.getTime() - checkIn.getTime()) / DAY_MS,
    );
    const bookingId = new Types.ObjectId();
    const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);
    const session = await this.connection.startSession();

    try {
      await session.withTransaction(async () => {
        let bookingCurrency: string | undefined;
        const now = new Date();
        const rooms: typeof bookingRooms = [];
        for (const selection of dto.rooms) {
          const guestCount =
            selection.adults + selection.childrenAges.length;
          if (guestCount < 1) {
            throw new BadRequestException(
              'Each selected room must have at least one guest',
            );
          }
          const roomId = new Types.ObjectId(selection.roomId);
          const room = await this.roomModel
            .findOne({
              _id: roomId,
              hotelId: hotel._id,
              isActive: true,
            })
            .session(session)
            .exec();
          if (
            !room ||
            room.maxOccupancy < guestCount ||
            !roomIsAvailable(room, dto.checkIn, dto.checkOut, now)
          ) {
            throw new ConflictException(
              `Room ${selection.roomId} is unavailable for the selected dates or guest count`,
            );
          }
          if (bookingCurrency && bookingCurrency !== room.currency) {
            throw new BadRequestException(
              'All selected rooms must use the same currency',
            );
          }
          bookingCurrency = room.currency;

          const reserved = await this.roomModel
            .findOneAndUpdate(
              {
                _id: roomId,
                hotelId: hotel._id,
                isActive: true,
                maxOccupancy: { $gte: guestCount },
                availabilityRanges: {
                  $elemMatch: {
                    startDate: { $lte: dto.checkIn },
                    endDate: { $gte: dto.checkOut },
                  },
                },
                blockedDates: {
                  $not: {
                    $elemMatch: { $gte: dto.checkIn, $lt: dto.checkOut },
                  },
                },
                reservations: {
                  $not: {
                    $elemMatch: {
                      checkIn: { $lt: checkOut },
                      checkOut: { $gt: checkIn },
                      ...activeReservationFilter(now),
                    },
                  },
                },
              },
              {
                $push: {
                  reservations: {
                    bookingId,
                    checkIn,
                    checkOut,
                    status: RoomReservationStatus.PENDING_PAYMENT,
                    expiresAt: holdExpiresAt,
                    adults: selection.adults,
                    childrenAges: selection.childrenAges,
                  },
                },
                $set: { everReserved: true },
              },
              { new: true, session },
            )
            .exec();
          if (!reserved) {
            throw new ConflictException(
              `Room ${selection.roomId} was just booked`,
            );
          }

          totalAmount += room.pricePerNight * nights;
          rooms.push({
            roomId,
            roomName: room.name,
            adults: selection.adults,
            childrenAges: selection.childrenAges,
            pricePerNight: room.pricePerNight,
            currency: room.currency,
          });
        }

        bookingRooms = rooms;
        const policySnapshot = {
          checkInTime: hotel.policy?.checkInTime ?? '15:00',
          checkOutTime: hotel.policy?.checkOutTime ?? '11:00',
          cancellationTiers: hotel.policy?.cancellationTiers ?? [],
        };
        await this.bookingModel.create(
          [
            {
              _id: bookingId,
              userId: new Types.ObjectId(user.sub),
              hotelId: hotel._id,
              rooms,
              checkIn,
              checkOut,
              nights,
              totalAmount,
              currency: bookingCurrency,
              policySnapshot,
              policyAcceptedAt: new Date(),
              status: HotelBookingStatus.PENDING_PAYMENT,
              holdExpiresAt,
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    try {
      const payment = await this.payments.createPayment(
        'hotel',
        bookingId.toString(),
        totalAmount,
        bookingRooms[0].currency.toLowerCase(),
        user.sub,
      );
      await this.bookingModel
        .updateOne(
          { _id: bookingId, status: HotelBookingStatus.PENDING_PAYMENT },
          { $set: { paymentId: payment.paymentId } },
        )
        .exec();
      return {
        booking: await this.bookingModel.findById(bookingId).exec(),
        payment,
      };
    } catch (error) {
      try {
        await this.fail(bookingId.toString());
      } catch (releaseError) {
        throw new AggregateError(
          [error, releaseError],
          'Payment setup failed and the hotel room hold could not be released',
        );
      }
      throw error;
    }
  }

  async findAll(user: JwtUser, query: HotelBookingQueryDto) {
    await this.markCompletedBookings(user.sub);
    const today = new Date(new Date().toISOString().slice(0, 10));
    const ownerFilter = { userId: user.sub };
    const [upcoming, past, cancelled] = await Promise.all([
      this.paginateBookings(
        {
          ...ownerFilter,
          status: {
            $in: [
              HotelBookingStatus.PENDING_PAYMENT,
              HotelBookingStatus.CONFIRMED,
            ],
          },
          checkIn: { $gte: today },
        },
        query,
      ),
      this.paginateBookings(
        { ...ownerFilter, status: HotelBookingStatus.COMPLETED },
        query,
      ),
      this.paginateBookings(
        { ...ownerFilter, status: HotelBookingStatus.CANCELLED },
        query,
      ),
    ]);
    return { upcoming, past, cancelled };
  }

  async findOne(id: string, user: JwtUser) {
    this.validateId(id);
    await this.markCompletedBookings(user.sub);
    const booking = await this.bookingModel.findById(id).exec();
    if (!booking) throw new NotFoundException('Hotel booking not found');
    assertOwner(booking.userId, user);
    return booking;
  }

  async findForHotel(
    hotelId: string,
    user: JwtUser,
    query: HotelBookingQueryDto,
  ) {
    const hotel = await this.hotelModel.findById(hotelId).exec();
    if (!hotel) throw new NotFoundException('Hotel not found');
    if (user.role !== Role.ADMIN && String(hotel._id) !== user.providerId) {
      throw new ForbiddenException(
        'You can only view reservations for your assigned hotel',
      );
    }
    const filter = { hotelId };
    const [data, total] = await Promise.all([
      this.bookingModel
        .find(filter)
        .populate('userId', 'firstName lastName email')
        .sort({ checkIn: 1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      this.bookingModel.countDocuments(filter).exec(),
    ]);
    return { data, page: query.page, limit: query.limit, total };
  }

  async cancel(id: string, user: JwtUser) {
    const booking = await this.findOne(id, user);
    if (booking.status === HotelBookingStatus.CANCELLED) {
      throw new ConflictException('Booking is already cancelled');
    }
    if (booking.status === HotelBookingStatus.PENDING_PAYMENT) {
      throw new ConflictException(
        'Wait for payment to finish before cancelling this booking',
      );
    }
    if (booking.status === HotelBookingStatus.CANCELLATION_PENDING) {
      throw new ConflictException('Cancellation is already being processed');
    }
    if (booking.status !== HotelBookingStatus.CONFIRMED) {
      throw new ConflictException('This booking cannot be cancelled');
    }

    const quote = this.cancellationQuote(booking);
    if (!quote.eligible) {
      throw new ConflictException(
        'A confirmed booking can only be cancelled before its check-in date',
      );
    }

    const acquired = await this.bookingModel
      .updateOne(
        { _id: booking._id, status: HotelBookingStatus.CONFIRMED },
        { $set: { status: HotelBookingStatus.CANCELLATION_PENDING } },
      )
      .exec();
    if (acquired.modifiedCount !== 1) {
      throw new ConflictException(
        'Booking status changed; please reload and try again',
      );
    }

    let refundId = booking.refundId;
    try {
      if (!refundId && quote.refundAmount > 0) {
        const refund = await this.payments.refundFor('hotel', {
          _id: booking._id,
          totalAmount: booking.totalAmount,
          policySnapshot: {
            ...booking.policySnapshot,
            cancellationRefundPercent: quote.refundPercent,
          },
        });
        refundId = refund.refundId;
      }
    } catch (error) {
      await this.bookingModel
        .updateOne(
          { _id: booking._id, status: HotelBookingStatus.CANCELLATION_PENDING },
          { $set: { status: HotelBookingStatus.CONFIRMED } },
        )
        .exec();
      throw error;
    }

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const result = await this.bookingModel
          .updateOne(
            {
              _id: booking._id,
              status: HotelBookingStatus.CANCELLATION_PENDING,
            },
            {
              $set: {
                status: HotelBookingStatus.CANCELLED,
                cancelledAt: new Date(),
                ...(refundId ? { refundId } : {}),
              },
            },
            { session },
          )
          .exec();
        if (result.modifiedCount !== 1) {
          throw new ConflictException(
            'Booking status changed; please reload and try again',
          );
        }
        await this.roomModel
          .updateMany(
            { _id: { $in: booking.rooms.map((room) => room.roomId) } },
            { $pull: { reservations: { bookingId: booking._id } } },
            { session },
          )
          .exec();
      });
    } finally {
      await session.endSession();
    }
    return this.bookingModel.findById(id).exec();
  }

  async confirm(id: string, paymentId: string) {
    this.validateId(id);
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const booking = await this.bookingModel
          .findById(id)
          .session(session)
          .exec();
        if (!booking) throw new NotFoundException('Hotel booking not found');
        if (
          booking.status === HotelBookingStatus.CONFIRMED &&
          booking.paymentId === paymentId
        ) {
          return;
        }
        if (
          booking.status !== HotelBookingStatus.PENDING_PAYMENT ||
          booking.holdExpiresAt <= new Date()
        ) {
          throw new ConflictException(
            'The booking payment hold has expired or is no longer active',
          );
        }
        const updated = await this.bookingModel
          .updateOne(
            { _id: booking._id, status: HotelBookingStatus.PENDING_PAYMENT },
            {
              $set: {
                status: HotelBookingStatus.CONFIRMED,
                paymentId,
                reference: `HTL-${booking._id.toString().toUpperCase()}`,
              },
            },
            { session },
          )
          .exec();
        if (updated.modifiedCount !== 1) {
          throw new ConflictException(
            'Booking status changed before payment confirmation',
          );
        }
        await this.roomModel
          .updateMany(
            {
              _id: { $in: booking.rooms.map((room) => room.roomId) },
              'reservations.bookingId': booking._id,
            },
            {
              $set: {
                'reservations.$[reservation].status':
                  RoomReservationStatus.CONFIRMED,
                'reservations.$[reservation].reference':
                  `HTL-${booking._id.toString().toUpperCase()}`,
              },
            },
            {
              arrayFilters: [{ 'reservation.bookingId': booking._id }],
              session,
            },
          )
          .exec();
      });
    } finally {
      await session.endSession();
    }
  }

  async fail(id: string) {
    this.validateId(id);
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const booking = await this.bookingModel
          .findById(id)
          .session(session)
          .exec();
        if (!booking || booking.status !== HotelBookingStatus.PENDING_PAYMENT)
          return;
        await this.bookingModel
          .updateOne(
            { _id: booking._id, status: HotelBookingStatus.PENDING_PAYMENT },
            {
              $set: {
                status:
                  booking.holdExpiresAt <= new Date()
                    ? HotelBookingStatus.EXPIRED
                    : HotelBookingStatus.PAYMENT_FAILED,
              },
            },
            { session },
          )
          .exec();
        await this.roomModel
          .updateMany(
            { _id: { $in: booking.rooms.map((room) => room.roomId) } },
            { $pull: { reservations: { bookingId: booking._id } } },
            { session },
          )
          .exec();
      });
    } finally {
      await session.endSession();
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async expirePendingBookings() {
    const expired = await this.bookingModel
      .find({
        status: HotelBookingStatus.PENDING_PAYMENT,
        holdExpiresAt: { $lte: new Date() },
      })
      .select('_id')
      .exec();
    for (const booking of expired) await this.fail(booking._id.toString());
  }

  async cancellationPreview(id: string, user: JwtUser) {
    const booking = await this.findOne(id, user);
    return this.cancellationQuote(booking);
  }

  private cancellationQuote(booking: HotelBookingDocument) {
    const today = new Date(new Date().toISOString().slice(0, 10));
    const checkInDate = new Date(booking.checkIn);
    const daysRemaining = Math.floor(
      (checkInDate.getTime() - today.getTime()) / DAY_MS,
    );
    const eligible =
      booking.status === HotelBookingStatus.CONFIRMED && daysRemaining > 0;
    const tier = eligible
      ? [...booking.policySnapshot.cancellationTiers]
          .filter((item) => item.daysBeforeCheckIn <= daysRemaining)
          .sort(
            (left, right) =>
              right.daysBeforeCheckIn - left.daysBeforeCheckIn,
          )[0]
      : undefined;
    const refundPercent = tier?.refundPercent ?? 0;
    return {
      bookingId: booking._id,
      eligible,
      daysRemaining,
      refundPercent,
      refundAmount: Math.floor(
        (booking.totalAmount * refundPercent) / 100,
      ),
      currency: booking.currency,
    };
  }

  private async markCompletedBookings(userId: string) {
    await this.completeEligibleStays({ userId });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async completePastStays() {
    await this.completeEligibleStays();
  }

  private async completeEligibleStays(ownerFilter: { userId?: string } = {}) {
    const now = new Date();
    const tomorrow = new Date(
      new Date(now.toISOString().slice(0, 10)).getTime() + DAY_MS,
    );
    const bookings = await this.bookingModel
      .find({
        ...ownerFilter,
        status: HotelBookingStatus.CONFIRMED,
        checkOut: { $lt: tomorrow },
      })
      .select('_id checkOut policySnapshot.checkOutTime')
      .exec();
    for (const booking of bookings) {
      const [hour, minute] = booking.policySnapshot.checkOutTime
        .split(':')
        .map(Number);
      const checkoutAt = new Date(booking.checkOut);
      checkoutAt.setUTCHours(hour, minute, 0, 0);
      if (checkoutAt <= now) {
        await this.bookingModel
          .updateOne(
            { _id: booking._id, status: HotelBookingStatus.CONFIRMED },
            { $set: { status: HotelBookingStatus.COMPLETED } },
          )
          .exec();
      }
    }
  }

  private async paginateBookings(
    filter: Record<string, unknown>,
    query: HotelBookingQueryDto,
  ) {
    const [data, total] = await Promise.all([
      this.bookingModel
        .find(filter)
        .populate('hotelId', 'name city country')
        .sort({ checkIn: 1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      this.bookingModel.countDocuments(filter).exec(),
    ]);
    return { data, page: query.page, limit: query.limit, total };
  }

  private validateId(id: string) {
    if (!isMongoId(id)) throw new BadRequestException('Invalid booking ID');
  }
}
