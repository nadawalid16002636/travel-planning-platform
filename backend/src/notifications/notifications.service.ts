import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { paginate, PaginationQueryDto } from '../common/pagination.dto.js';
import { Notification } from './schemas/notification.schema.js';

const TITLES: Record<string, string> = {
  BOOKING_CONFIRMED: 'Booking confirmed',
  BOOKING_CANCELLED: 'Booking cancelled',
  FLIGHT_SCHEDULE_CHANGED: 'Flight schedule changed',
  FLIGHT_CANCELLED: 'Flight cancelled',
  PAYMENT_HOLD_EXPIRED: 'Payment hold expired',
  REFUND_PENDING: 'Refund pending',
  REFUND_COMPLETED: 'Refund completed',
  REFUND_FAILED: 'Refund failed',
  ACCOUNT_SUSPENDED: 'Account suspended',
  ACCOUNT_REACTIVATED: 'Account reactivated',
  PROVIDER_DEACTIVATED: 'Provider deactivated',
  PROVIDER_REACTIVATED: 'Provider reactivated',
};

/** GEN-01. Other modules call notify(); this module stores and lists the result. */
@Injectable()
export class NotificationsService {
  constructor(@InjectModel(Notification.name) private readonly notifications: Model<Notification>) {}

  async notify(userId: string, type: string, payload: Record<string, unknown> = {}): Promise<void> {
    if (!userId) return;
    await this.notifications.create({
      userId: String(userId),
      type,
      title: TITLES[type] ?? 'Notification',
      payload,
      read: false,
    });
  }

  async list(userId: string, query: PaginationQueryDto & { unread?: boolean }) {
    const filter: Record<string, unknown> = { userId };
    if (query.unread) filter.read = false;
    const [data, total] = await Promise.all([
      this.notifications
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      this.notifications.countDocuments(filter),
    ]);
    return paginate(data, total, query);
  }

  unreadCount(userId: string) {
    return this.notifications.countDocuments({ userId, read: false }).then((count) => ({ count }));
  }

  async markRead(userId: string, id: string) {
    const updated = await this.notifications
      .findOneAndUpdate({ _id: id, userId }, { $set: { read: true, readAt: new Date() } }, { returnDocument: 'after' })
      .exec();
    if (!updated) throw new NotFoundException('Notification not found');
    return updated;
  }

  async markAllRead(userId: string) {
    const result = await this.notifications.updateMany({ userId, read: false }, { $set: { read: true, readAt: new Date() } }).exec();
    return { updated: result.modifiedCount };
  }
}
