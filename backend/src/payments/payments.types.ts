export type BookingType = 'flight' | 'hotel';

/** Booking modules register these so the webhook can confirm or release a booking. */
export interface BookingPaymentHandler {
  confirm(bookingId: string, paymentId: string): Promise<void>;
  fail(bookingId: string): Promise<void>;
}
