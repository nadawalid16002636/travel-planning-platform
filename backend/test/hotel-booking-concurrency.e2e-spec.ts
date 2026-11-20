/**
 * HTL-16 / HTL-18: hotel booking concurrency.
 * Runs against a RUNNING backend (npm run start:dev) using the demo data from `npm run seed:demo`.
 * Each run uses a random future date range, so re-running never collides with holds from earlier runs.
 * The winning request creates a Stripe test-mode payment, so STRIPE_SECRET_KEY (sk_test_...) must be set.
 */
import { beforeAll, describe, expect, it } from 'vitest';

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'Demo@12345';
const TRAVELERS = ['traveler1@demo.travel', 'traveler2@demo.travel', 'traveler3@demo.travel'];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (n: number) => new Date(Date.now() + n * 86_400_000);

type Session = { cookie: string; user: any };

async function login(email: string): Promise<Session> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed for ${email}: ${res.status} ${await res.text()}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const body: any = await res.json();
  return { cookie, user: body.user };
}

async function bookRooms(s: Session, hotelId: string, roomIds: string[], checkIn: string, checkOut: string) {
  const res = await fetch(`${API}/hotel-bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: s.cookie },
    body: JSON.stringify({
      hotelId,
      checkIn,
      checkOut,
      rooms: roomIds.map((roomId) => ({ roomId, adults: 1, childrenAges: [] })),
      acceptPolicies: true,
    }),
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

/** Active (pending or confirmed) bookings of this user that include the room on the given check-in date. */
async function activeBookingsFor(s: Session, roomId: string, checkIn: string) {
  const res = await fetch(`${API}/hotel-bookings?page=1&limit=50`, { headers: { cookie: s.cookie } });
  if (!res.ok) throw new Error(`GET /hotel-bookings failed: ${res.status} ${await res.text()}`);
  const body: any = await res.json();
  const list: any[] = body.upcoming?.data ?? [];
  return list.filter(
    (b) => String(b.checkIn).startsWith(checkIn) && (b.rooms ?? []).some((r: any) => String(r.roomId) === roomId),
  );
}

describe('Hotel booking concurrency (HTL-16, HTL-18)', () => {
  let travelers: Session[];
  let hotelId: string;
  let roomIds: string[];
  let checkIn: string;
  let checkOut: string;

  beforeAll(async () => {
    travelers = await Promise.all(TRAVELERS.map(login));
    const moderator = await login('hotel1.moderator@demo.travel');
    hotelId = moderator.user.providerId;
    if (!hotelId) throw new Error('hotel1 moderator has no providerId: run `npm run seed:demo` first');

    // random 2-night stay 30-280 days ahead (seeded availability covers the next 365 days)
    const offset = 30 + Math.floor(Math.random() * 250);
    checkIn = iso(addDays(offset));
    checkOut = iso(addDays(offset + 2));

    const res = await fetch(
      `${API}/hotels/${hotelId}/rooms/available?checkIn=${checkIn}&checkOut=${checkOut}`,
    );
    const body: any = await res.json();
    const list: any[] = Array.isArray(body) ? body : (body.data ?? body.rooms ?? []);
    roomIds = list.map((r) => String(r._id ?? r.id));
    if (roomIds.length < 3) {
      throw new Error(`Expected at least 3 available rooms, got: ${JSON.stringify(body).slice(0, 500)}`);
    }
  }, 60_000);

  it('allows exactly one of many simultaneous bookings for the same room and dates', async () => {
    const room = roomIds[0];
    const REQUESTS = 12;
    const results = await Promise.all(
      Array.from({ length: REQUESTS }, (_, i) =>
        bookRooms(travelers[i % travelers.length], hotelId, [room], checkIn, checkOut),
      ),
    );

    const statuses = results.map((r) => r.status);
    const successes = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    // Printed to help debugging: e.g. 500s usually mean Stripe is not configured.
    console.log('same-room statuses:', statuses.join(','));

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(REQUESTS - 1);

    const perUser = await Promise.all(travelers.map((t) => activeBookingsFor(t, room, checkIn)));
    expect(perUser.flat()).toHaveLength(1);
  }, 120_000);

  it('rejects overlapping dates for an already held room', async () => {
    // roomIds[0] is held for [checkIn, checkOut) by the previous test; shift by one night
    const overlapIn = iso(new Date(new Date(`${checkIn}T00:00:00Z`).getTime() + 86_400_000));
    const overlapOut = iso(new Date(new Date(`${checkOut}T00:00:00Z`).getTime() + 86_400_000));
    const res = await bookRooms(travelers[0], hotelId, [roomIds[0]], overlapIn, overlapOut);
    expect(res.status).toBe(409);
  }, 60_000);

  it('handles multi-room bookings as one operation (no partial holds)', async () => {
    // fresh dates so the previous tests do not interfere
    const offset = 300 + Math.floor(Math.random() * 40);
    const inDate = iso(addDays(offset));
    const outDate = iso(addDays(offset + 2));
    const [a, b, c] = [roomIds[1], roomIds[2], roomIds[3] ?? roomIds[0]];

    // request 1 wants rooms A+B, request 2 wants rooms B+C: they share B, so only one may win
    const [r1, r2] = await Promise.all([
      bookRooms(travelers[0], hotelId, [a, b], inDate, outDate),
      bookRooms(travelers[1], hotelId, [b, c], inDate, outDate),
    ]);
    console.log('multi-room statuses:', r1.status, r2.status);

    expect([r1.status, r2.status].filter((s) => s === 201)).toHaveLength(1);
    expect([r1.status, r2.status].filter((s) => s === 409)).toHaveLength(1);

    // the losing request must not have left a hold on its non-shared room
    const loserOnlyRoom = r1.status === 409 ? a : c;
    const retry = await bookRooms(travelers[2], hotelId, [loserOnlyRoom], inDate, outDate);
    expect(retry.status).toBe(201);
  }, 120_000);
});
