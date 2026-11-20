/**
 * PAY-01 / PAY-02 / PAY-03: hotel payments with Stripe TEST mode.
 * Runs against a RUNNING backend (npm run start:dev) and the demo data from `npm run seed:demo`.
 * It pays PaymentIntents through Stripe's test API (pm_card_visa / pm_card_chargeDeclined) and then
 * posts a webhook event signed with STRIPE_WEBHOOK_SECRET, so the Stripe CLI is NOT needed.
 * The backend still retrieves every PaymentIntent from Stripe before confirming a booking.
 * Reads STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and MONGODB_URI from backend/.env (never printed).
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import Stripe from 'stripe';

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'Demo@12345';

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}
const ENV = loadEnv();
const STRIPE_KEY = ENV.STRIPE_SECRET_KEY ?? '';
const WEBHOOK_SECRET = ENV.STRIPE_WEBHOOK_SECRET ?? '';
if (!STRIPE_KEY.startsWith('sk_test_')) {
  throw new Error('STRIPE_SECRET_KEY in backend/.env must be a Stripe TEST key (it starts with sk_test_).');
}
if (!WEBHOOK_SECRET) {
  throw new Error('STRIPE_WEBHOOK_SECRET is missing in backend/.env (any value works, e.g. whsec_local_test_secret).');
}
const stripe = new Stripe(STRIPE_KEY);

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (n: number) => new Date(Date.now() + n * 86_400_000);
/** Each test uses its own 40-day window so tests never collide with each other. */
function stay(slot: number) {
  const offset = 40 + slot * 60 + Math.floor(Math.random() * 40);
  return { checkIn: iso(addDays(offset)), checkOut: iso(addDays(offset + 2)) };
}

type Session = { cookie: string; user: any };

async function call(s: Session | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(s ? { cookie: s.cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, json, text };
}

async function login(email: string): Promise<Session> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed for ${email}: ${res.status}. Did you run npm run seed:demo?`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return { cookie, user: ((await res.json()) as any).user };
}

/** Sends a webhook event for a PaymentIntent, signed with the given secret. */
async function sendWebhook(type: string, intentId: string, secret = WEBHOOK_SECRET) {
  const intent = await stripe.paymentIntents.retrieve(intentId);
  const payload = JSON.stringify({
    id: `evt_test_${randomUUID().replace(/-/g, '')}`,
    object: 'event',
    created: Math.floor(Date.now() / 1000),
    type,
    data: { object: intent },
  });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const res = await fetch(`${API}/payments/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': header },
    body: payload,
  });
  return res.status;
}

const pay = (intentId: string) =>
  stripe.paymentIntents.confirm(intentId, { payment_method: 'pm_card_visa', return_url: 'https://example.com/return' });

async function payDeclined(intentId: string) {
  try {
    await stripe.paymentIntents.confirm(intentId, {
      payment_method: 'pm_card_chargeDeclined',
      return_url: 'https://example.com/return',
    });
  } catch (error: any) {
    if (error?.type !== 'StripeCardError') throw error; // a declined card is the expected outcome
  }
}

describe('Hotel payments with Stripe test mode (PAY-01, PAY-02, PAY-03)', () => {
  let traveler: Session;
  let traveler2: Session;
  let hotelId: string;
  let roomId: string;

  async function book(s: Session, window: { checkIn: string; checkOut: string }) {
    const res = await call(s, 'POST', '/hotel-bookings', {
      hotelId,
      roomId: undefined,
      checkIn: window.checkIn,
      checkOut: window.checkOut,
      rooms: [{ roomId, adults: 1, childrenAges: [] }],
      acceptPolicies: true,
    });
    return res;
  }

  async function newBooking(s: Session, window: { checkIn: string; checkOut: string }) {
    const res = await book(s, window);
    expect(res.status, `booking failed: ${res.text.slice(0, 300)}`).toBe(201);
    return {
      bookingId: String(res.json.booking._id),
      paymentId: String(res.json.payment.paymentId),
      total: Number(res.json.booking.totalAmount),
    };
  }

  const getBooking = async (s: Session, id: string) => (await call(s, 'GET', `/hotel-bookings/${id}`)).json;
  const getPayment = async (s: Session, id: string) => (await call(s, 'GET', `/payments/${id}`)).json;

  beforeAll(async () => {
    traveler = await login('traveler1@demo.travel');
    traveler2 = await login('traveler2@demo.travel');
    const moderator = await login('hotel1.moderator@demo.travel');
    hotelId = moderator.user.providerId;
    if (!hotelId) throw new Error('hotel1 moderator has no providerId: run npm run seed:demo first');
    const w = stay(0);
    const rooms = await call(null, 'GET', `/hotels/${hotelId}/rooms/available?checkIn=${w.checkIn}&checkOut=${w.checkOut}`);
    const list: any[] = Array.isArray(rooms.json) ? rooms.json : (rooms.json?.data ?? []);
    if (!list.length) throw new Error(`No available rooms for hotel1: ${rooms.text.slice(0, 300)}`);
    roomId = String(list[0]._id ?? list[0].id);
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });

  it('does not confirm a booking on a forged or unverified webhook (PAY-01)', async () => {
    const { bookingId, paymentId } = await newBooking(traveler, stay(0));
    expect((await getBooking(traveler, bookingId)).status).toBe('pending_payment');

    // 1. wrong signature -> rejected
    expect(await sendWebhook('payment_intent.succeeded', paymentId, 'whsec_wrong_secret')).toBe(400);
    // 2. correctly signed "succeeded" event, but the card was never charged -> verification with Stripe fails
    expect(await sendWebhook('payment_intent.succeeded', paymentId)).toBe(409);

    expect((await getBooking(traveler, bookingId)).status).toBe('pending_payment');
    expect((await getPayment(traveler, paymentId)).status).not.toBe('succeeded');
  }, 60_000);

  it('confirms the booking after a successful test card payment (PAY-01)', async () => {
    const { bookingId, paymentId } = await newBooking(traveler, stay(1));

    const intent = await pay(paymentId);
    expect(intent.status).toBe('succeeded');
    expect([200, 201]).toContain(await sendWebhook('payment_intent.succeeded', paymentId));

    const booking = await getBooking(traveler, bookingId);
    expect(booking.status).toBe('confirmed');
    expect(String(booking.reference)).toMatch(/^HTL-/);
    expect((await getPayment(traveler, paymentId)).status).toBe('succeeded');

    // the same event delivered twice must not break anything
    expect([200, 201]).toContain(await sendWebhook('payment_intent.succeeded', paymentId));

    await call(traveler, 'POST', `/hotel-bookings/${bookingId}/cancel`); // cleanup
  }, 90_000);

  it('keeps the booking unconfirmed after a declined card and allows a retry (PAY-01)', async () => {
    const { bookingId, paymentId } = await newBooking(traveler, stay(2));

    await payDeclined(paymentId);
    expect([200, 201]).toContain(await sendWebhook('payment_intent.payment_failed', paymentId));

    expect((await getBooking(traveler, bookingId)).status).toBe('pending_payment'); // not confirmed
    expect((await getPayment(traveler, paymentId)).status).toBe('failed');

    // retry the same PaymentIntent with a good card
    const retry = await call(traveler, 'POST', `/payments/${paymentId}/retry`);
    expect([200, 201]).toContain(retry.status);
    expect((await pay(paymentId)).status).toBe('succeeded');
    expect([200, 201]).toContain(await sendWebhook('payment_intent.succeeded', paymentId));
    expect((await getBooking(traveler, bookingId)).status).toBe('confirmed');

    await call(traveler, 'POST', `/hotel-bookings/${bookingId}/cancel`); // cleanup
  }, 120_000);

  it('refunds a cancelled confirmed booking according to the policy (PAY-03)', async () => {
    const { bookingId, paymentId, total } = await newBooking(traveler, stay(3));
    await pay(paymentId);
    await sendWebhook('payment_intent.succeeded', paymentId);
    expect((await getBooking(traveler, bookingId)).status).toBe('confirmed');

    const cancel = await call(traveler, 'POST', `/hotel-bookings/${bookingId}/cancel`);
    expect([200, 201], cancel.text.slice(0, 300)).toContain(cancel.status);
    expect(cancel.json.status).toBe('cancelled');
    expect(cancel.json.refundId).toBeTruthy();

    const refund = await call(traveler, 'GET', `/refunds/${cancel.json.refundId}`);
    expect(refund.status).toBe(200);
    expect(refund.json.status).toMatch(/Refunded|Pending/);
    expect(refund.json.amount).toBe(total); // check-in is 7+ days away -> 100% refund
  }, 120_000);

  it('releases the room when the payment hold expires (PAY-01)', async () => {
    const w = stay(4);
    const { bookingId } = await newBooking(traveler, w);

    // make the hold look expired (the minute-by-minute job then releases it)
    await mongoose.connect(ENV.MONGODB_URI);
    const oid = new mongoose.Types.ObjectId(bookingId);
    const past = new Date(Date.now() - 60_000);
    await mongoose.connection.collection('hotelbookings').updateOne({ _id: oid }, { $set: { holdExpiresAt: past } });
    await mongoose.connection
      .collection('hotelrooms')
      .updateMany(
        { 'reservations.bookingId': oid },
        { $set: { 'reservations.$[r].expiresAt': past } },
        { arrayFilters: [{ 'r.bookingId': oid }] },
      );

    let status = '';
    for (let i = 0; i < 30 && status !== 'expired'; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      status = (await getBooking(traveler, bookingId)).status;
    }
    expect(status).toBe('expired');

    // an expired booking can no longer be paid ...
    const late = await call(traveler, 'POST', '/payments', { bookingType: 'hotel', bookingId });
    expect(late.status).toBe(409);
    // ... and the same room and dates are bookable again
    const rebooked = await book(traveler2, w);
    expect(rebooked.status, rebooked.text.slice(0, 300)).toBe(201);
  }, 240_000);
});