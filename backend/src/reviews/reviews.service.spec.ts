import { Types } from 'mongoose';
import { Role } from '../common/roles.js';
import { HotelBookingStatus } from '../hotel-bookings/entities/hotel-booking.entity.js';
import { ReviewsService } from './reviews.service.js';

describe('ReviewsService', () => {
  it('rejects reviews before checkout has completed', async () => {
    const userId = new Types.ObjectId();
    const booking = {
      _id: new Types.ObjectId(),
      userId,
      hotelId: new Types.ObjectId(),
      status: HotelBookingStatus.CONFIRMED,
      checkOut: new Date(Date.now() + 24 * 60 * 60 * 1000),
      policySnapshot: { checkOutTime: '11:00' },
    };
    const connection = { startSession: vi.fn() };
    const bookingModel = {
      findById: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(booking) })),
    };
    const service = new ReviewsService(
      connection as never,
      {} as never,
      bookingModel as never,
      {} as never,
    );

    await expect(
      service.create(
        booking._id.toString(),
        { sub: userId.toString(), role: Role.USER },
        { rating: 5, comment: 'Great stay' },
      ),
    ).rejects.toThrow('after a completed stay');
    expect(connection.startSession).not.toHaveBeenCalled();
  });

  it('ACC-12: shows reviews of deactivated users as "Deleted user"', async () => {
    const hotelId = new Types.ObjectId();
    const active = new Types.ObjectId();
    const gone = new Types.ObjectId();
    const doc = (userId: Types.ObjectId) => ({ userId, rating: 4, toObject: () => ({ userId, rating: 4 }) });
    const chain = { sort: vi.fn(), skip: vi.fn(), limit: vi.fn(), exec: vi.fn().mockResolvedValue([doc(active), doc(gone)]) };
    for (const key of ['sort', 'skip', 'limit'] as const) chain[key].mockReturnValue(chain);
    const reviewModel = {
      find: vi.fn().mockReturnValue(chain),
      countDocuments: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(2) }),
    };
    const hotelModel = { findById: vi.fn(() => ({ exec: vi.fn().mockResolvedValue({ _id: hotelId }) })) };
    const users = {
      basicInfo: vi.fn().mockResolvedValue([
        { id: String(active), name: 'Mona Hassan' },
        { id: String(gone), name: 'Deleted user' },
      ]),
    };
    const service = new ReviewsService({} as never, reviewModel as never, {} as never, hotelModel as never, users as never);

    const result = await service.findForHotel(String(hotelId), { page: 1, limit: 10 } as never);

    expect(result.data.map((review: any) => review.reviewer.name)).toEqual(['Mona Hassan', 'Deleted user']);
    expect(result.total).toBe(2);
  });
});
