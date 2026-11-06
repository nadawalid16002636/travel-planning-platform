import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { isMongoId } from 'class-validator';
import { Connection, Model, Types } from 'mongoose';
import { assertOwner } from '../common/guards.js';
import { JwtUser } from '../common/roles.js';
import {
  HotelBooking,
  HotelBookingStatus,
} from '../hotel-bookings/entities/hotel-booking.entity.js';
import { Hotel } from '../hotels/entities/hotel.entity.js';
import { ReviewQueryDto } from './dto/review-query.dto.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { UpdateReviewDto } from './dto/update-review.dto.js';
import { Review } from './entities/review.entity.js';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Review.name) private readonly reviewModel: Model<Review>,
    @InjectModel(HotelBooking.name)
    private readonly bookingModel: Model<HotelBooking>,
    @InjectModel(Hotel.name)
    private readonly hotelModel: Model<Hotel>,
  ) {}

  async create(bookingId: string, user: JwtUser, dto: CreateReviewDto) {
    this.validateId(bookingId);
    const booking = await this.bookingModel.findById(bookingId).exec();
    if (!booking) throw new NotFoundException('Hotel booking not found');
    assertOwner(booking.userId, user);
    const [checkOutHour, checkOutMinute] = booking.policySnapshot.checkOutTime
      .split(':')
      .map(Number);
    const stayCompletedAt = new Date(booking.checkOut);
    stayCompletedAt.setUTCHours(checkOutHour, checkOutMinute, 0, 0);
    if (
      booking.status !== HotelBookingStatus.CONFIRMED ||
      stayCompletedAt > new Date()
    ) {
      throw new ConflictException(
        'A review can only be submitted after a completed stay',
      );
    }

    const session = await this.connection.startSession();
    try {
      let review: Review | null = null;
      await session.withTransaction(async () => {
        const [created] = await this.reviewModel.create(
          [
            {
              userId: booking.userId,
              hotelId: booking.hotelId,
              bookingId: booking._id,
              rating: dto.rating,
              comment: dto.comment.trim(),
            },
          ],
          { session },
        );
        review = created;
        await this.updateHotelRating(booking.hotelId, session);
      });
      if (!review) throw new ConflictException('Review could not be created');
      return review;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        throw new ConflictException('This booking already has a review');
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async findForHotel(hotelId: string, query: ReviewQueryDto) {
    this.validateId(hotelId);
    const hotel = await this.hotelModel.findById(hotelId).exec();
    if (!hotel) throw new NotFoundException('Hotel not found');
    const filter = { hotelId: new Types.ObjectId(hotelId) };
    const [data, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      this.reviewModel.countDocuments(filter).exec(),
    ]);
    return { data, page: query.page, limit: query.limit, total };
  }

  async update(id: string, user: JwtUser, dto: UpdateReviewDto) {
    this.validateId(id);
    const review = await this.reviewModel
      .findOneAndUpdate(
        { _id: id, userId: user.sub },
        {
          $set: Object.assign(
            {},
            dto,
            dto.comment ? { comment: dto.comment.trim() } : {},
          ),
        },
        { new: true, runValidators: true },
      )
      .exec();
    if (!review) throw new NotFoundException('Review not found');
    await this.updateHotelRating(review.hotelId);
    return review;
  }

  async remove(id: string, user: JwtUser) {
    this.validateId(id);
    const session = await this.connection.startSession();
    try {
      let deleted: Review | null = null;
      await session.withTransaction(async () => {
        deleted = await this.reviewModel
          .findOneAndDelete({ _id: id, userId: user.sub }, { session })
          .exec();
        if (!deleted) throw new NotFoundException('Review not found');
        await this.updateHotelRating(deleted.hotelId, session);
      });
      return { message: 'Review deleted successfully' };
    } finally {
      await session.endSession();
    }
  }

  private async updateHotelRating(
    hotelId: Types.ObjectId,
    session?: import('mongoose').ClientSession,
  ) {
    const aggregation = this.reviewModel.aggregate<{
      averageRating: number;
      count: number;
    }>([
      { $match: { hotelId } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          count: { $sum: 1 },
        },
      },
    ]);
    if (session) aggregation.session(session);
    const [stats] = await aggregation.exec();
    await this.hotelModel
      .updateOne(
        { _id: hotelId },
        {
          $set: {
            averageReviewRating: stats?.averageRating ?? 0,
            reviewCount: stats?.count ?? 0,
          },
        },
        { session },
      )
      .exec();
  }

  private validateId(id: string) {
    if (!isMongoId(id)) throw new BadRequestException('Invalid review ID');
  }
}
