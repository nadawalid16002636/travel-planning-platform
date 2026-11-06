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
});
