import { describe, expect, it, vi } from 'vitest';
import { PaymentsService } from './payments.service.js';

describe('P2 verified payment bridge', () => {
  function setup(overrides = {}) {
    const intent = { id: 'pi_test', amount: 1200, currency: 'usd', status: 'succeeded',
      metadata: { bookingType: 'flight', bookingId: 'booking', userId: 'user' }, ...overrides };
    const payment = { bookingType: 'flight', bookingId: 'booking', userId: 'user', amount: 1200, currency: 'USD' };
    const payments = { findOne: vi.fn(() => ({ exec: async () => payment })),
      updateOne: vi.fn(() => ({ exec: async () => ({}) })) };
    const events = { findOne: vi.fn(() => ({ exec: async () => null })), create: vi.fn() };
    const stripe = { constructEvent: vi.fn(() => ({ id: 'evt', type: 'payment_intent.payment_failed', intent })),
      retrievePaymentIntent: vi.fn(async () => intent) };
    const bookings = { applyVerifiedPayment: vi.fn() };
    const service = new PaymentsService({} as any, payments as any, {} as any, events as any,
      stripe as any, bookings as any, {} as any, {} as any);
    return { service, bookings, payments, events };
  }

  it('rejects a retrieved amount mismatch before updating payment or booking', async () => {
    const { service, bookings, payments, events } = setup({ amount: 1 });
    await expect(service.handleWebhook(Buffer.from('body'), 'signature')).rejects.toThrow('does not match');
    expect(bookings.applyVerifiedPayment).not.toHaveBeenCalled();
    expect(payments.updateOne).not.toHaveBeenCalled();
    expect(events.create).not.toHaveBeenCalled();
  });

  it('uses the current successful intent when an older failure arrives', async () => {
    const { service, bookings } = setup();
    await service.handleWebhook(Buffer.from('body'), 'signature');
    expect(bookings.applyVerifiedPayment).toHaveBeenCalledWith({ bookingId: 'booking',
      paymentId: 'pi_test', outcome: 'succeeded', amountMinor: 1200, currency: 'USD' });
  });

  it('rejects metadata belonging to a different owner', async () => {
    const { service, bookings } = setup({ metadata: { bookingType: 'flight', bookingId: 'booking', userId: 'other' } });
    await expect(service.handleWebhook(Buffer.from('body'), 'signature')).rejects.toThrow('does not match');
    expect(bookings.applyVerifiedPayment).not.toHaveBeenCalled();
  });
});
