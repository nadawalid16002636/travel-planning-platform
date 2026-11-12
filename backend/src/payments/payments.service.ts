import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types, type Connection } from 'mongoose';
import { NotificationsService } from '../notifications/notifications.service.js';
import { BookingsService } from '../p2/bookings.service.js';
import { HotelBooking, HotelBookingStatus } from '../hotel-bookings/entities/hotel-booking.entity.js';
import { BookingPaymentHandler, BookingType } from './payments.types.js';
import { Payment, PaymentStatus } from './schemas/payment.schema.js';
import { StripeEvent } from './schemas/payment.schema.js';
import { Refund, RefundStatus } from './schemas/refund.schema.js';
import { GatewayEvent, StripeGateway } from './stripe.gateway.js';

interface Payable {
  bookingType: BookingType;
  bookingId: string;
  userId: string;
  amount: number;
  currency: string;
  expiresAt: Date;
  acceptedAt?: Date;
  status: string;
}

const FLIGHT_EVENTS: Record<string, string> = {
  'booking-confirmed': 'BOOKING_CONFIRMED',
  'booking-cancelled': 'BOOKING_CANCELLED',
  'flight-schedule-changed': 'FLIGHT_SCHEDULE_CHANGED',
  'flight-cancelled': 'FLIGHT_CANCELLED',
  'payment-hold-expired': 'PAYMENT_HOLD_EXPIRED',
  'refund-completed': 'REFUND_COMPLETED',
  'refund-failed': 'REFUND_FAILED',
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly handlers = new Map<BookingType, BookingPaymentHandler>();

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
    @InjectModel(Refund.name) private readonly refunds: Model<Refund>,
    @InjectModel(StripeEvent.name) private readonly events: Model<StripeEvent>,
    private readonly stripe: StripeGateway,
    private readonly bookings: BookingsService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  registerHandler(type: BookingType, handler: BookingPaymentHandler): void {
    this.handlers.set(type, handler);
  }

  /**
   * One PaymentIntent per booking, reused for retries. Amount and currency come from the
   * booking, never from the client. PAY-01, PAY-02, PAY-04.
   */
  async start(type: BookingType, bookingId: string, userId: string) {
    const payable = await this.payable(type, bookingId, userId);
    return this.createPayment(type, bookingId, payable.amount, payable.currency, userId);
  }

  async createPayment(
    type: BookingType,
    bookingId: string,
    amount: number,
    currency: string,
    userId: string,
  ): Promise<{ paymentId: string; clientSecret: string }> {
    const payable = await this.payable(type, bookingId, userId);
    this.assertMatches(payable, amount, currency);
    this.assertPayable(payable);
    const existing = await this.payments.findOne({ bookingType: type, bookingId }).exec();
    if (existing) return this.reuse(existing);
    const intent = await this.stripe.createPaymentIntent({
      amount: payable.amount,
      currency: payable.currency,
      metadata: { bookingType: type, bookingId, userId },
      idempotencyKey: `pay-${type}-${bookingId}`,
    });
    if (!intent.clientSecret) {
      throw new ServiceUnavailableException('Stripe did not return a client secret');
    }
    try {
      await this.payments.create({
        bookingType: type,
        bookingId,
        userId,
        stripePaymentIntentId: intent.id,
        amount: payable.amount,
        currency: payable.currency,
        status: 'pending',
        expiresAt: payable.expiresAt,
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const saved = await this.payments.findOne({ bookingType: type, bookingId }).exec();
        if (saved) return this.reuse(saved);
      }
      throw error;
    }
    return { paymentId: intent.id, clientSecret: intent.clientSecret };
  }

  async retry(paymentId: string, userId: string): Promise<{ paymentId: string; clientSecret: string }> {
    const payment = await this.findOwned(paymentId, userId);
    const payable = await this.payable(payment.bookingType, payment.bookingId, userId);
    this.assertPayable(payable);
    return this.reuse(payment);
  }

  async getPayment(paymentId: string, userId: string, isAdmin: boolean) {
    const payment = await this.findByStripeId(paymentId);
    if (!isAdmin && payment.userId !== userId) throw new ForbiddenException('You do not own this payment');
    const refund = await this.refunds.findOne({ paymentIntentId: payment.stripePaymentIntentId }).sort({ createdAt: -1 }).exec();
    return this.present(payment, refund);
  }

  async getRefund(id: string, userId: string, isAdmin: boolean) {
    const refund = await this.refunds
      .findOne(/^[a-f\d]{24}$/i.test(id) ? { $or: [{ stripeRefundId: id }, { _id: id }] } : { stripeRefundId: id })
      .exec();
    if (!refund) throw new NotFoundException('Refund not found');
    if (!isAdmin && refund.userId !== userId) throw new ForbiddenException('You do not own this refund');
    return {
      id: refund.stripeRefundId,
      bookingType: refund.bookingType,
      bookingId: refund.bookingId,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
    };
  }

  async policies(type: BookingType, bookingId: string, userId: string) {
    const payable = await this.payable(type, bookingId, userId);
    if (type === 'hotel') {
      const booking = await this.hotelModel().findById(bookingId).exec();
      return {
        bookingType: type,
        bookingId,
        acceptedAt: payable.acceptedAt,
        checkInTime: booking?.policySnapshot.checkInTime,
        checkOutTime: booking?.policySnapshot.checkOutTime,
        cancellationTiers: booking?.policySnapshot.cancellationTiers ?? [],
      };
    }
    const flight = await this.flightModel().findById(bookingId).lean();
    return {
      bookingType: type,
      bookingId,
      acceptedAt: payable.acceptedAt,
      legs: (flight?.legs ?? []).map((leg) => leg.policySnapshot),
    };
  }

  async acceptPolicies(type: BookingType, bookingId: string, userId: string) {
    const payable = await this.payable(type, bookingId, userId);
    if (payable.status !== 'pending' && payable.status !== 'pending-payment' && payable.status !== HotelBookingStatus.PENDING_PAYMENT) {
      throw new ConflictException('Policies can only be accepted while the booking awaits payment');
    }
    if (payable.acceptedAt) return { acceptedAt: payable.acceptedAt };
    const acceptedAt = new Date();
    if (type === 'hotel') {
      await this.hotelModel().updateOne({ _id: bookingId, userId }, { $set: { policyAcceptedAt: acceptedAt } }).exec();
    } else {
      await this.flightModel().updateOne({ _id: bookingId, userId }, { $set: { acceptedPoliciesAt: acceptedAt } }).exec();
    }
    return { acceptedAt };
  }

  /** Hotel cancellations call this directly. Flights are pulled from pendingRefunds(). PAY-03. */
  async refundFor(
    type: BookingType,
    booking: { _id: unknown; totalAmount: number; policySnapshot: unknown },
  ): Promise<{ refundId: string; amount: number }> {
    const bookingId = String(booking._id);
    const percent = this.refundPercent(booking.policySnapshot);
    const amount = Math.floor((booking.totalAmount * percent) / 100);
    if (amount <= 0) throw new BadRequestException('This cancellation has no refund');
    const payment = await this.payments.findOne({ bookingType: type, bookingId, status: 'succeeded' }).exec();
    if (!payment) throw new ConflictException('No successful payment to refund');
    const existing = await this.refunds.findOne({ bookingType: type, bookingId, status: { $ne: 'Failed' } }).exec();
    if (existing) return { refundId: existing.stripeRefundId, amount: existing.amount };
    const refund = await this.issueRefund(payment, amount, `refund-${type}-${bookingId}`);
    await this.notifications.notify(payment.userId, refund.status === 'Refunded' ? 'REFUND_COMPLETED' : 'REFUND_PENDING', {
      bookingType: type,
      bookingId,
      refundId: refund.stripeRefundId,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
    });
    return { refundId: refund.stripeRefundId, amount: refund.amount };
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<{ received: true }> {
    let event: GatewayEvent;
    try {
      event = this.stripe.constructEvent(rawBody, signature);
    } catch (error) {
      if (this.stripe.signatureError(error)) throw new BadRequestException('Invalid Stripe signature');
      throw error;
    }
    if (!event.type.startsWith('payment_intent.')) return { received: true };
    const seen = await this.events.findOne({ eventId: event.id }).exec();
    if (seen) return { received: true };
    await this.applyIntentEvent(event);
    try {
      await this.events.create({ eventId: event.id, type: event.type });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    return { received: true };
  }

  /** Polls P2's outbox: notifications, Stripe refunds, and cancelling expired PaymentIntents. */
  async maintain(): Promise<void> {
    await this.deliverFlightEvents();
    await this.processFlightRefunds();
    await this.cancelExpiredIntents();
  }

  private async applyIntentEvent(event: GatewayEvent): Promise<void> {
    const intent = event.intent;
    const type = intent.metadata.bookingType as BookingType | undefined;
    const bookingId = intent.metadata.bookingId;
    if ((type !== 'flight' && type !== 'hotel') || !bookingId) return;
    const payment = await this.payments.findOne({ stripePaymentIntentId: intent.id }).exec();
    if (event.type === 'payment_intent.succeeded') {
      await this.mark(intent.id, 'succeeded');
      if (type === 'flight') {
        await this.bookings.applyVerifiedPayment({
          bookingId,
          paymentId: intent.id,
          outcome: 'succeeded',
          amountMinor: payment?.amount ?? intent.amount,
          currency: payment?.currency ?? intent.currency.toUpperCase(),
        });
      } else {
        await this.confirmHotel(bookingId, intent.id, payment?.amount ?? intent.amount, payment?.currency ?? intent.currency);
      }
      return;
    }
    if (event.type !== 'payment_intent.payment_failed' && event.type !== 'payment_intent.canceled') return;
    const outcome = event.type === 'payment_intent.canceled' ? 'cancelled' : 'failed';
    await this.mark(intent.id, outcome === 'cancelled' ? 'cancelled' : 'failed');
    if (type === 'flight') {
      await this.bookings.applyVerifiedPayment({
        bookingId,
        paymentId: intent.id,
        outcome,
        amountMinor: payment?.amount ?? intent.amount,
        currency: payment?.currency ?? intent.currency.toUpperCase(),
      });
      return;
    }
    const booking = await this.hotelModel().findById(bookingId).exec();
    const holdOpen = booking?.status === HotelBookingStatus.PENDING_PAYMENT && booking.holdExpiresAt > new Date();
    // PAY-01: a declined card stays retryable until the hold expires. Do not release the rooms yet.
    if (!holdOpen) await this.handlers.get('hotel')?.fail(bookingId);
  }

  private async confirmHotel(bookingId: string, paymentId: string, amount: number, currency: string): Promise<void> {
    const booking = await this.hotelModel().findById(bookingId).exec();
    if (!booking) throw new NotFoundException('Hotel booking not found');
    const holdOpen = booking.status === HotelBookingStatus.PENDING_PAYMENT && booking.holdExpiresAt > new Date();
    if (!holdOpen && booking.status !== HotelBookingStatus.CONFIRMED && booking.status !== HotelBookingStatus.COMPLETED) {
      const payment = await this.payments.findOne({ stripePaymentIntentId: paymentId }).exec();
      if (payment) await this.issueRefund(payment, amount, `late-${bookingId}`);
      if (booking.status === HotelBookingStatus.PENDING_PAYMENT) await this.handlers.get('hotel')?.fail(bookingId);
      return;
    }
    const handler = this.handlers.get('hotel');
    if (!handler) throw new ServiceUnavailableException('Hotel payments are not ready');
    await handler.confirm(bookingId, paymentId);
    if (booking.status === HotelBookingStatus.PENDING_PAYMENT) {
      await this.notifications.notify(String(booking.userId), 'BOOKING_CONFIRMED', {
        bookingType: 'hotel',
        bookingId,
        paymentId,
        amount,
        currency,
      });
    }
  }

  private async reuse(payment: Payment): Promise<{ paymentId: string; clientSecret: string }> {
    const intent = await this.stripe.retrievePaymentIntent(payment.stripePaymentIntentId);
    if (intent.status === 'succeeded') throw new ConflictException('This booking is already paid');
    if (intent.status === 'canceled') throw new ConflictException('This payment was cancelled');
    if (!intent.clientSecret) throw new ServiceUnavailableException('Stripe did not return a client secret');
    return { paymentId: intent.id, clientSecret: intent.clientSecret };
  }

  private async issueRefund(
    payment: Pick<Payment, 'bookingType' | 'bookingId' | 'userId' | 'stripePaymentIntentId' | 'currency'>,
    amount: number,
    idempotencyKey: string,
  ): Promise<Refund> {
    const stripeRefund = await this.stripe.createRefund({
      paymentIntentId: payment.stripePaymentIntentId,
      amount,
      idempotencyKey,
    });
    const status = this.refundStatus(stripeRefund.status);
    return this.refunds.findOneAndUpdate(
      { stripeRefundId: stripeRefund.id },
      {
        $set: {
          bookingType: payment.bookingType,
          bookingId: payment.bookingId,
          userId: payment.userId,
          paymentIntentId: payment.stripePaymentIntentId,
          amount: stripeRefund.amount,
          currency: payment.currency,
          status,
        },
      },
      { upsert: true, returnDocument: 'after' },
    ).exec() as Promise<Refund>;
  }

  private async deliverFlightEvents(): Promise<void> {
    const pending = await this.bookings.pendingEvents();
    for (const event of pending) {
      try {
        const payload = (event.payload ?? {}) as Record<string, unknown>;
        if (event.kind === 'payment-hold-expired' && typeof payload.paymentId === 'string' && this.stripe.configured()) {
          await this.stripe.cancelPaymentIntent(payload.paymentId);
          await this.mark(payload.paymentId, 'cancelled');
        }
        if (event.userId) {
          await this.notifications.notify(String(event.userId), FLIGHT_EVENTS[event.kind] ?? event.kind, {
            bookingId: event.bookingId ? String(event.bookingId) : undefined,
            ...payload,
          });
        }
        await this.bookings.acknowledgeEvent(String(event._id));
      } catch (error) {
        this.logger.error(`Flight event ${String(event._id)} was not delivered`, error as Error);
      }
    }
  }

  private async processFlightRefunds(): Promise<void> {
    if (!this.stripe.configured()) return;
    const pending = await this.bookings.pendingRefunds();
    for (const booking of pending) {
      const bookingId = String(booking._id);
      if (!booking.paymentId || !booking.refundDueMinor) continue;
      const payment = await this.payments.findOne({ stripePaymentIntentId: booking.paymentId }).exec();
      const record = payment ?? {
        bookingType: 'flight' as const,
        bookingId,
        userId: String(booking.userId),
        stripePaymentIntentId: String(booking.paymentId),
        currency: String(booking.currency),
      };
      try {
        const refund = await this.issueRefund(record, booking.refundDueMinor, bookingId);
        if (refund.status === 'Pending') continue;
        await this.bookings.acknowledgeVerifiedRefund(
          bookingId,
          booking.paymentId,
          booking.refundDueMinor,
          refund.status === 'Refunded' ? 'completed' : 'failed',
        );
      } catch (error) {
        if (!this.stripe.permanentError(error)) {
          this.logger.error(`Flight refund ${bookingId} will be retried`, error as Error);
          continue;
        }
        try {
          await this.bookings.acknowledgeVerifiedRefund(bookingId, booking.paymentId, booking.refundDueMinor, 'failed');
        } catch (ackError) {
          this.logger.error(`Flight refund ${bookingId} could not be marked failed`, ackError as Error);
        }
      }
    }
  }

  private async cancelExpiredIntents(): Promise<void> {
    if (!this.stripe.configured()) return;
    const expired = await this.payments
      .find({ status: { $in: ['pending', 'failed'] }, expiresAt: { $lte: new Date() } })
      .limit(100)
      .exec();
    for (const payment of expired) {
      try {
        await this.stripe.cancelPaymentIntent(payment.stripePaymentIntentId);
        await this.mark(payment.stripePaymentIntentId, 'cancelled');
      } catch (error) {
        this.logger.error(`Could not cancel PaymentIntent ${payment.stripePaymentIntentId}`, error as Error);
      }
    }
  }

  private async payable(type: BookingType, bookingId: string, userId: string): Promise<Payable> {
    if (!Types.ObjectId.isValid(bookingId)) throw new BadRequestException('Invalid booking ID');
    if (type === 'hotel') {
      const booking = await this.hotelModel().findById(bookingId).exec();
      if (!booking) throw new NotFoundException('Hotel booking not found');
      if (String(booking.userId) !== userId) throw new ForbiddenException('You do not own this booking');
      return {
        bookingType: type,
        bookingId,
        userId,
        amount: booking.totalAmount,
        currency: booking.currency,
        expiresAt: booking.holdExpiresAt,
        acceptedAt: booking.policyAcceptedAt,
        status: booking.status,
      };
    }
    const booking = await this.flightModel().findById(bookingId).lean();
    if (!booking) throw new NotFoundException('Flight booking not found');
    if (String(booking.userId) !== userId) throw new ForbiddenException('You do not own this booking');
    return {
      bookingType: type,
      bookingId,
      userId,
      amount: booking.totalMinor,
      currency: booking.currency,
      expiresAt: new Date(booking.paymentExpiresAt),
      acceptedAt: booking.acceptedPoliciesAt ? new Date(booking.acceptedPoliciesAt) : undefined,
      status: booking.status,
    };
  }

  private assertMatches(payable: Payable, amount: number, currency: string): void {
    if (payable.amount !== amount || payable.currency.toLowerCase() !== currency.toLowerCase()) {
      throw new ConflictException('Payment amount or currency does not match the booking');
    }
  }

  private assertPayable(payable: Payable): void {
    const pending = payable.status === HotelBookingStatus.PENDING_PAYMENT || payable.status === 'pending-payment';
    if (!pending) throw new ConflictException('Booking is not awaiting payment');
    if (payable.expiresAt <= new Date()) throw new ConflictException('The payment hold has expired');
    if (!payable.acceptedAt) throw new ConflictException('Accept the provider policies before payment');
    const platform = (this.config.get<string>('PLATFORM_CURRENCY') || 'USD').toUpperCase();
    if (payable.currency.toUpperCase() !== platform) {
      throw new BadRequestException(`Payments use the platform currency ${platform}`);
    }
  }

  private refundPercent(snapshot: unknown): number {
    const policy = snapshot as { cancellationRefundPercent?: number; refundPercent?: number };
    const percent = policy?.cancellationRefundPercent ?? policy?.refundPercent ?? 0;
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
      throw new BadRequestException('Invalid refund percentage');
    }
    return percent;
  }

  private refundStatus(status: string | null): RefundStatus {
    if (status === 'succeeded') return 'Refunded';
    if (status === 'failed' || status === 'canceled') return 'Failed';
    return 'Pending';
  }

  private async mark(stripePaymentIntentId: string, status: PaymentStatus): Promise<void> {
    await this.payments.updateOne({ stripePaymentIntentId }, { $set: { status } }).exec();
  }

  private async findOwned(paymentId: string, userId: string): Promise<Payment> {
    const payment = await this.findByStripeId(paymentId);
    if (payment.userId !== userId) throw new ForbiddenException('You do not own this payment');
    return payment;
  }

  private async findByStripeId(paymentId: string): Promise<Payment> {
    const payment = await this.payments.findOne({ stripePaymentIntentId: paymentId }).exec();
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  private present(payment: Payment, refund: Refund | null) {
    return {
      id: payment.stripePaymentIntentId,
      bookingType: payment.bookingType,
      bookingId: payment.bookingId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      expiresAt: payment.expiresAt,
      refund: refund
        ? { id: refund.stripeRefundId, amount: refund.amount, currency: refund.currency, status: refund.status }
        : null,
    };
  }

  private hotelModel(): Model<HotelBooking> {
    return this.connection.model<HotelBooking>(HotelBooking.name);
  }

  private flightModel(): Model<FlightRow> {
    return this.connection.model<FlightRow>('FlightBooking');
  }

}

interface FlightRow {
  userId: string;
  status: string;
  totalMinor: number;
  currency: string;
  paymentExpiresAt: Date;
  acceptedPoliciesAt?: Date;
  legs?: Array<{ policySnapshot?: unknown }>;
}
