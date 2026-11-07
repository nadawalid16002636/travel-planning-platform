import { Types } from 'mongoose';
import { HotelBookingsService } from './hotel-bookings.service.js';
import { HotelBookingStatus } from './entities/hotel-booking.entity.js';
import { HotelStatus } from '../hotels/entities/hotel.entity.js';
import { Role } from '../common/roles.js';

describe('HotelBookingsService', () => {
  it('reserves multiple rooms together and sends the policy snapshot price to payments', async () => {
    const hotelId = new Types.ObjectId();
    const firstRoomId = new Types.ObjectId();
    const secondRoomId = new Types.ObjectId();
    const hotel = {
      _id: hotelId,
      status: HotelStatus.ACTIVE,
      policy: {
        checkInTime: '15:00',
        checkOutTime: '11:00',
        cancellationTiers: [
          { daysBeforeCheckIn: 1, refundPercent: 80 },
        ],
      },
    };
    const rooms = [
      {
        _id: firstRoomId,
        name: 'Standard',
        currency: 'USD',
        pricePerNight: 1000,
        maxOccupancy: 4,
        availabilityRanges: [
          { startDate: '2000-01-01', endDate: '2999-12-31' },
        ],
        blockedDates: [],
        reservations: [],
      },
      {
        _id: secondRoomId,
        name: 'Deluxe',
        currency: 'USD',
        pricePerNight: 1500,
        maxOccupancy: 4,
        availabilityRanges: [
          { startDate: '2000-01-01', endDate: '2999-12-31' },
        ],
        blockedDates: [],
        reservations: [],
      },
    ];
    let createdBooking: Record<string, unknown> | undefined;
    const session = {
      withTransaction: vi.fn((work: () => Promise<void>) => work()),
      endSession: vi.fn(),
    };
    const connection = { startSession: vi.fn().mockResolvedValue(session) };
    const hotelModel = {
      findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(hotel) })),
    };
    let roomLookup = 0;
    const roomModel = {
      findOne: vi.fn(() => ({
        session: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(rooms[roomLookup++]),
      })),
      findOneAndUpdate: vi.fn(() => ({
        exec: vi.fn().mockResolvedValue({}),
      })),
    };
    const pendingBooking = { status: HotelBookingStatus.PENDING_PAYMENT };
    const bookingModel = {
      create: vi.fn(async (documents: Record<string, unknown>[]) => {
        [createdBooking] = documents;
        return documents;
      }),
      updateOne: vi.fn(() => ({
        exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      })),
      findById: vi.fn(() => ({
        exec: vi.fn().mockResolvedValue(pendingBooking),
      })),
    };
    const payments = {
      registerHandler: vi.fn(),
      createPayment: vi.fn().mockResolvedValue({
        paymentId: 'pi_test',
        clientSecret: 'secret_test',
      }),
    };
    const service = new HotelBookingsService(
      connection as never,
      bookingModel as never,
      hotelModel as never,
      roomModel as never,
      payments as never,
    );
    const checkIn = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const checkOut = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    await service.create(
      { sub: new Types.ObjectId().toString(), role: Role.USER },
      {
        hotelId: hotelId.toString(),
        checkIn,
        checkOut,
        acceptPolicies: true,
        rooms: [
          {
            roomId: firstRoomId.toString(),
            adults: 2,
            childrenAges: [],
          },
          {
            roomId: secondRoomId.toString(),
            adults: 3,
            childrenAges: [],
          },
        ],
      },
    );

    expect(roomModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(bookingModel.create).toHaveBeenCalledTimes(1);
    expect(createdBooking?.totalAmount).toBe(5000);
    expect(createdBooking?.status).toBe(HotelBookingStatus.PENDING_PAYMENT);
    expect(createdBooking?.policyAcceptedAt).toBeInstanceOf(Date);
    expect(payments.createPayment).toHaveBeenCalledWith(
      'hotel',
      expect.any(String),
      5000,
      'usd',
      expect.any(String),
    );
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('requires policy acceptance before reserving inventory', async () => {
    const service = new HotelBookingsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.create(
        { sub: new Types.ObjectId().toString(), role: Role.USER },
        {
          hotelId: new Types.ObjectId().toString(),
          checkIn: '2030-01-01',
          checkOut: '2030-01-02',
          acceptPolicies: false,
          rooms: [
            {
              roomId: new Types.ObjectId().toString(),
              adults: 1,
              childrenAges: [],
            },
          ],
        },
      ),
    ).rejects.toThrow('You must accept the hotel policies');
  });
});
