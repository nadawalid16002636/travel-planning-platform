import { Injectable } from '@nestjs/common';

export type BookingType = 'flight' | 'hotel';

/** Booking modules register these so the webhook can confirm/fail without circular imports. */
export interface BookingPaymentHandler {
  confirm(bookingId: string, paymentId: string): Promise<void>; // mark confirmed, issue reference
  fail(bookingId: string): Promise<void>; // leave unconfirmed, release inventory
}

/** PAY-01..03. Owner: P4. */
@Injectable()
export class PaymentsService {
  private readonly handlers = new Map<BookingType, BookingPaymentHandler>();

  /** P2 (flights) and P3 (hotels) call this once in onModuleInit(). */
  registerHandler(type: BookingType, handler: BookingPaymentHandler): void {
    this.handlers.set(type, handler);
  }

  /** Creates a Stripe PaymentIntent (test mode). Returns the client secret for the frontend. */
  async createPayment(
    type: BookingType,
    bookingId: string,
    amount: number, // in the smallest currency unit
    currency: string,
    userId: string,
  ): Promise<{ paymentId: string; clientSecret: string }> {
    // TODO P4
    throw new Error('Not implemented yet');
  }

  /** Refund owed for a cancellation, from the policy snapshot stored on the booking. */
  async refundFor(
    type: BookingType,
    booking: { _id: unknown; totalAmount: number; policySnapshot: unknown },
  ): Promise<{ refundId: string; amount: number }> {
    // TODO P4
    throw new Error('Not implemented yet');
  }

  /** Called by the webhook after Stripe signature verification. */
  protected async handlePaymentResult(type: BookingType, bookingId: string, paymentId: string, ok: boolean) {
    const handler = this.handlers.get(type);
    if (!handler) throw new Error(`No payment handler registered for ${type}`);
    return ok ? handler.confirm(bookingId, paymentId) : handler.fail(bookingId);
  }
}
