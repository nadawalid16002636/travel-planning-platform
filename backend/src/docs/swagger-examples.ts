/**
 * P6: ready-to-run request examples for Swagger UI ("Try it out").
 *
 * Every JSON request body gets one or more named examples here, so the TA (and the team) can run any endpoint
 * without typing a body. Ids in the examples are placeholders: replace them with ids from your own data.
 * Values match the reference data in backend/seed-data (cities, airports, countries) and the DTO rules.
 *
 * If an endpoint here is renamed or removed, the API logs a warning at startup so this file can be updated.
 */
import type { OpenAPIObject } from '@nestjs/swagger';

type Body = Record<string, unknown>;
type Examples = Record<string, { summary: string; value: Body }>;

/** Placeholder ids. Valid ObjectId format, so they pass validation; replace them with real ids. */
const ID = {
  airline: '6650a1b2c3d4e5f6a7b8c901',
  flight: '6650a1b2c3d4e5f6a7b8c902',
  returnFlight: '6650a1b2c3d4e5f6a7b8c903',
  hold: '6650a1b2c3d4e5f6a7b8c904',
  flightBooking: '6650a1b2c3d4e5f6a7b8c905',
  hotel: '6650a1b2c3d4e5f6a7b8c906',
  room: '6650a1b2c3d4e5f6a7b8c907',
  hotelBooking: '6650a1b2c3d4e5f6a7b8c908',
  review: '6650a1b2c3d4e5f6a7b8c909',
};

const one = (summary: string, value: Body): Examples => ({ default: { summary, value } });

export const REQUEST_EXAMPLES: Record<string, Examples> = {
  // ---------- Accounts (P1) ----------
  'POST /api/auth/register': one('New traveler (log in with the same email and password)', {
    email: 'sara@example.com',
    password: 'Travel#2026',
    firstName: 'Sara',
    lastName: 'Ahmed',
    phone: '+201001234567',
    acceptTerms: true,
  }),
  'POST /api/auth/login': {
    traveler: {
      summary: 'Traveler registered with the register example',
      value: { email: 'sara@example.com', password: 'Travel#2026' },
    },
    admin: {
      summary: 'Seeded admin (default ADMIN_EMAIL / ADMIN_PASSWORD from .env.example)',
      value: { email: 'admin@travel.local', password: 'Change-Me-Admin1!' },
    },
    moderator: {
      summary: 'Moderator first login (then call PATCH /api/auth/change-password)',
      value: { email: 'ops.hotel@example.com', password: 'TempPass#2026' },
    },
  },
  'PATCH /api/auth/change-password': {
    traveler: {
      summary: 'Traveler changes their password',
      value: { currentPassword: 'Travel#2026', newPassword: 'NewTravel#2026' },
    },
    moderator: {
      summary: 'Moderator replaces the temporary password from the admin',
      value: { currentPassword: 'TempPass#2026', newPassword: 'HotelOps#2026' },
    },
  },
  'PATCH /api/users/me': one('Update profile and preferred currency', {
    firstName: 'Sara',
    lastName: 'Ahmed',
    phone: '+201001234567',
    nationality: 'Egyptian',
    dateOfBirth: '2003-05-14',
    preferences: { currency: 'EGP', language: 'en' },
  }),
  'DELETE /api/users/me': one('Confirm deactivation with your password', { password: 'Travel#2026' }),
  'POST /api/admin/moderators': {
    hotel: {
      summary: 'Hotel moderator (providerId = a hotel id)',
      value: {
        email: 'ops.hotel@example.com',
        firstName: 'Omar',
        lastName: 'Hassan',
        password: 'TempPass#2026',
        providerType: 'hotel',
        providerId: ID.hotel,
      },
    },
    airline: {
      summary: 'Airline moderator (providerId = an airline id)',
      value: {
        email: 'ops.airline@example.com',
        firstName: 'Mona',
        lastName: 'Fathy',
        password: 'TempPass#2026',
        providerType: 'airline',
        providerId: ID.airline,
      },
    },
  },
  'PATCH /api/admin/accounts/{id}/suspend': one('Suspend with a reason', { reason: 'Repeated policy violations' }),

  // ---------- Airlines and flights (P2) ----------
  'POST /api/airlines': one('Create an airline', {
    name: 'EgyptAir',
    code: 'MS',
    country: 'EG',
    description: 'National carrier of Egypt',
  }),
  'PATCH /api/airlines/{id}': one('Update the description', {
    description: 'National carrier of Egypt, Star Alliance member',
  }),
  'PUT /api/airlines/{id}/baggage-policy': one('23 kg checked, 7 kg cabin, $50 per extra bag', {
    checkedBaggageKg: 23,
    cabinBaggageKg: 7,
    extraBagPriceMinor: 5000,
    maxExtraBagsPerPassenger: 2,
    currency: 'USD',
  }),
  'PUT /api/airlines/{id}/cancellation-policy': one('Full refund 14+ days out, half 3+ days, none after', {
    tiers: [
      { daysBeforeDeparture: 14, refundPercent: 100 },
      { daysBeforeDeparture: 3, refundPercent: 50 },
      { daysBeforeDeparture: 0, refundPercent: 0 },
    ],
  }),
  'POST /api/flights': one('Cairo to London, economy and business (set the airline policies first)', {
    flightNumber: 'MS777',
    airlineId: ID.airline,
    departureAirport: 'CAI',
    arrivalAirport: 'LHR',
    departureAt: '2026-12-20T09:00',
    arrivalAt: '2026-12-20T12:00',
    cabins: [
      { cabinClass: 'economy', capacity: 120, priceMinor: 35000, currency: 'USD', freeBags: 1, maxWeightKgPerBag: 23 },
      { cabinClass: 'business', capacity: 20, priceMinor: 120000, currency: 'USD', freeBags: 2, maxWeightKgPerBag: 32 },
    ],
  }),
  'PATCH /api/flights/{id}': one('Move the flight one hour later', {
    departureAt: '2026-12-20T10:00',
    arrivalAt: '2026-12-20T13:00',
  }),
  'POST /api/flights/{id}/cancel': one('Confirm the cancellation', { confirmed: true }),
  'POST /api/flights/{id}/cabins': one('Add a premium economy cabin', {
    cabinClass: 'premium-economy',
    capacity: 24,
    priceMinor: 60000,
    currency: 'USD',
    freeBags: 2,
    maxWeightKgPerBag: 23,
  }),
  'PATCH /api/flights/{id}/cabins/{cabinId}': one('Change capacity and price', { capacity: 30, priceMinor: 55000 }),
  'POST /api/flight-bookings/hold': {
    oneWay: {
      summary: 'One-way, 2 seats in economy',
      value: { legs: [{ flightId: ID.flight, cabinClass: 'economy' }], seats: 2 },
    },
    roundTrip: {
      summary: 'Round trip, 2 seats (outbound + return flight)',
      value: {
        legs: [
          { flightId: ID.flight, cabinClass: 'economy' },
          { flightId: ID.returnFlight, cabinClass: 'economy' },
        ],
        seats: 2,
      },
    },
  },
  'POST /api/flight-bookings': one('Book a 2-seat hold for an adult and a child', {
    holdId: ID.hold,
    passengers: [
      { name: 'Sara Ahmed', type: 'adult', dateOfBirth: '2003-05-14', documentNumber: 'A12345678' },
      { name: 'Youssef Ahmed', type: 'child', dateOfBirth: '2018-03-02', documentNumber: 'A87654321' },
    ],
    contactEmail: 'sara@example.com',
    acceptedPolicies: true,
  }),
  'POST /api/flight-bookings/{id}/cancel': one('Confirm the cancellation', { confirmed: true }),

  // ---------- Hotels, bookings and reviews (P3) ----------
  'POST /api/hotels': one('Create a hotel in Cairo', {
    name: 'Nile View Hotel',
    city: 'cairo',
    country: 'EG',
    address: '12 Corniche El Nil, Garden City',
    description: 'Riverside hotel ten minutes from Tahrir Square',
    starRating: 4,
    amenities: ['wifi', 'pool', 'breakfast'],
  }),
  'PATCH /api/hotels/{id}': one('Update description and amenities', {
    description: 'Riverside hotel with a rooftop pool',
    amenities: ['wifi', 'pool', 'breakfast', 'gym'],
  }),
  'POST /api/hotels/{id}/rooms': one('Double room, $120 per night (prices are in cents, platform currency)', {
    name: 'Room 101',
    type: 'Deluxe double',
    bedCount: 1,
    maxOccupancy: 2,
    pricePerNight: 12000,
    currency: 'USD',
    amenities: ['wifi', 'minibar'],
  }),
  'PATCH /api/hotels/{id}/rooms/{roomId}': one('Raise the nightly price to $135', { pricePerNight: 13500 }),
  'POST /api/hotels/{id}/rooms/{roomId}/availability': one('Block two dates', {
    blockedDates: ['2026-12-24', '2026-12-25'],
  }),
  'PATCH /api/hotels/{id}/rooms/{roomId}/availability': {
    open: {
      summary: 'Open the room for booking from December to February',
      value: { availabilityRanges: [{ startDate: '2026-12-01', endDate: '2027-03-01' }] },
    },
    block: { summary: 'Block dates', value: { blockedDates: ['2026-12-24', '2026-12-25'] } },
    unblock: { summary: 'Unblock dates', value: { unblockedDates: ['2026-12-24'] } },
  },
  'PUT /api/hotels/{id}/policies': one('Check-in 15:00, check-out 11:00, refund tiers', {
    checkInTime: '15:00',
    checkOutTime: '11:00',
    cancellationTiers: [
      { daysBeforeCheckIn: 7, refundPercent: 100 },
      { daysBeforeCheckIn: 2, refundPercent: 50 },
    ],
  }),
  'POST /api/hotel-bookings': one('3 nights, one room, 2 adults', {
    hotelId: ID.hotel,
    checkIn: '2026-12-20',
    checkOut: '2026-12-23',
    rooms: [{ roomId: ID.room, adults: 2, childrenAges: [] }],
    acceptPolicies: true,
  }),
  'POST /api/hotel-bookings/{bookingId}/review': one('Review after a completed stay', {
    rating: 5,
    comment: 'Great location and very helpful staff.',
  }),
  'PATCH /api/reviews/{id}': one('Edit your review', { rating: 4, comment: 'Great location, breakfast could be better.' }),

  // ---------- Payments and moderation (P4) ----------
  'POST /api/payments': {
    flight: { summary: 'Pay for a pending flight booking', value: { bookingType: 'flight', bookingId: ID.flightBooking } },
    hotel: { summary: 'Pay for a pending hotel booking', value: { bookingType: 'hotel', bookingId: ID.hotelBooking } },
  },
  'POST /api/reports': one('Report a review', {
    targetType: 'review',
    targetId: ID.review,
    reason: 'Contains offensive language',
  }),
  'PATCH /api/admin/reports/{id}': one('Hide the reported content', { action: 'hide' }),
};

/** Adds REQUEST_EXAMPLES to the generated document. Warns about examples whose endpoint no longer exists. */
export function applySwaggerExamples(document: OpenAPIObject): OpenAPIObject {
  for (const [key, examples] of Object.entries(REQUEST_EXAMPLES)) {
    const [method, path] = key.split(' ');
    const operation = document.paths[path]?.[method.toLowerCase() as 'get'];
    const body = operation?.requestBody;
    const json = body && 'content' in body ? body.content['application/json'] : undefined;
    if (!json) {
      console.warn(`[swagger-examples] no JSON body for "${key}"; update backend/src/docs/swagger-examples.ts`);
      continue;
    }
    json.examples = examples;
  }
  return document;
}
