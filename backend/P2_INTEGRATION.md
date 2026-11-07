# P2 integration contracts

## Setup and local verification

Use Node.js compatible with NestJS 10 and the existing lockfile. From `backend`:

```sh
npm ci
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

On Windows PowerShell with script execution disabled, use `npm.cmd`.
The integration tests start a disposable, loopback-only MongoDB replica set;
they never import AppModule, load `.env`, or connect to the team Atlas database.
The first run downloads MongoDB into ignored `node_modules/.cache/mongodb-binaries`.
Network access is needed once. `MONGOMS_SYSTEM_BINARY` can point to an already
installed compatible MongoDB binary when downloads are unavailable. Tests fail,
rather than silently skip, if the replica set cannot start.

Copy `.env.example` to `.env`, obtain the team URI securely, and run the
insert-only airport importer described in [data/README.md](data/README.md).
Then `npm run start:dev` serves Swagger at `http://localhost:3000/api/docs`.
App startup requires Atlas connectivity. No extra API prefix is required.
The application retains the existing global ValidationPipe and Swagger setup.

Atlas must support sessions and multi-document transactions. No standalone
MongoDB fallback is used because it would compromise round-trip atomicity.
Unique indexes must build successfully before accepting traffic. Existing
duplicate records require team-leader reconciliation; no migration deletes data.

## P1: authentication and assignment

P1 is absent from this checkout. Every P2 private/write route uses `P2Access`,
which returns 401 until a trusted authentication adapter is registered. There
is no production header bypass, fake login, hardcoded account, or competing JWT
implementation. P1 should import `P2AccessModule`, inject `P2Access`, and call:

```ts
access.register({
  authenticate: async (context) => {
    // Verify the secure httpOnly session using P1's existing service.
    // Also enforce expiry, suspension, and first-login password-change rules.
    const account = await p1.verifySession(context.switchToHttp().getRequest());
    if (!account) return null;
    return {
      id: String(account.id),
      roles: account.roles, // map to 'admin', 'user', 'airline-moderator'
      airlineIds: account.assignedAirline ? [String(account.assignedAirline)] : [],
    };
  },
});
```

This is an integration example, not an implemented P1 service. Never construct
the principal from client-provided user/role/provider fields. `P2Identity` is a
shared injected registry so route guard instances use the registered adapter.
Airline moderators must have exactly one assignment; users may manage only
their own bookings. Administrators create airlines; airline moderators and
administrators manage the authorized airline. P1 owns assignment persistence,
administrative booking inspection, session security and CSRF protection.

P2 Swagger declares cookie authentication (`session`); P1 must reconcile its
actual cookie name. The existing bearer definition remains available for the
team's other endpoints. The test header adapter exists only inside
`p2.integration.spec.ts`, on its isolated test server, and is explicitly enabled
by running that suite. It is never imported by the application.

## P4: payment, refund and notification integration

P4 is absent. Import `P2Module` and inject `BookingsService`. There are no P2
HTTP endpoints that accept a client claim of payment success.

1. Call `paymentContext(bookingId, verifiedPrincipal)` to obtain the authoritative
   minor-unit amount, currency, acceptance timestamp and original hold deadline.
   Pass those server values to Stripe; never accept the amount from the client.
2. Use one Stripe PaymentIntent per booking, reusing it for retries, with the
   booking ID in verified server-owned metadata. Card details stay in Stripe
   Elements and never enter P2.
3. After validating the Stripe webhook signature and retrieving/verifying the
   PaymentIntent, call `applyVerifiedPayment({ bookingId, paymentId, outcome,
   amountMinor, currency })`. Allowed outcomes are `succeeded`, `failed`,
   `cancelled`. This method is a trusted server API, not a signature verifier.
4. A failed/cancelled attempt before the original deadline stays Pending Payment
   with seats held, allowing PAY-01 retries. Expiry releases inventory. A late
   successful capture never revives inventory; it creates a full refund request.
5. Poll `pendingEvents()` and deliver in-app notifications or cancel expired
   PaymentIntents as appropriate. Events include `booking-confirmed`,
   `flight-schedule-changed`, `flight-cancelled`, `booking-cancelled`,
   `payment-hold-expired` and refund outcomes. Fetch booking details by the trusted
   event booking ID when the notification needs more data. Use event `_id` as
   the consumer deduplication key and acknowledge only after delivery via
   `acknowledgeEvent(id)`. Delivery is at least once.
6. Poll `pendingRefunds()` and use the booking ID as the Stripe refund idempotency
   key. Verify the Stripe refund outcome, then call
   `acknowledgeVerifiedRefund(bookingId, paymentId, amountMinor, 'completed' | 'failed')`.
   P2 records refund status and a notification event. P4 owns failed-refund retries.

These outbox/refund records are durable coordination requests. They do not
claim that a Stripe refund or in-app notification has actually been delivered.
P4's logo uploads (GEN-08) must provide the validated HTTPS URL stored by Airlines.
P1/P4 should also consume or bridge relevant events into the team's audit system.

## Booking and inventory behavior

Cabin `reserved` includes active holds and confirmed bookings. Confirmation
transfers ownership from a temporary hold/pending booking to a confirmed booking
without incrementing reserved seats a second time. Capacity and revision checks,
MongoDB transactions, and conditional state transitions prevent double release
and concurrent overbooking. Round trips reserve, pay and cancel as one itinerary.

The ten-minute deadline starts when `POST /flight-bookings/hold` reserves seats.
`POST /flight-bookings` consumes that hold and returns the accepted-policy snapshot,
passenger/baggage summary, fare and baggage subtotals, and total before payment.
The payment deadline is never extended by creating the summary or retrying payment.
Unused holds and expired pending payments release seats on the 30-second worker
tick or before another hold request. Offline workers resume persistent expiry work
after restart; stale holds can temporarily understate availability, never oversell.

FLT-12 rules are taken from the official workbook: adults 12+, children 2-11,
infants under 2; children pay full fare, infants 10%, with no infant seats;
at least one adult and at most one infant per adult. Age is measured on the
outbound airport-local departure date. No undocumented passenger-count business
limit is imposed; representable safe integers and the available cabin capacity
bound inventory. Minor-unit infant prices round per passenger per segment.

Each passenger supplies `extraBagWeightsKg`, e.g. `[10, 12.5]`. Every weight is
checked against the selected cabin and the bag count against the airline policy.
Fees are per extra bag per segment. Cabin free allowance and extra-bag prices
are frozen when holding, and cancellation tiers are frozen with the same quote.
Subsequent price/policy changes do not alter an accepted booking.

The cancellation quote uses the outbound segment's highest tier threshold no
greater than whole days remaining, applied to the entire round-trip total.
No matching tier means zero refund. Both user and provider cancellation requests
require `{ "confirmed": true }`. User cancellation is restricted to Confirmed
bookings before outbound departure; provider cancellations release all affected
itinerary seats and request full refunds for confirmed bookings. Pending bookings
on provider-cancelled flights expire. Invalid schedule changes that break an
existing round trip are rejected. Valid changes update active itineraries and
queue notifications, retaining their agreed fares.

Flights become Departed after departure; confirmed bookings become Completed
after their final segment arrives. Stored statuses are lower-case API values.
Search dates use each departure airport's IANA zone, including daylight saving.
Flight creation accepts airport-local date-times or explicit UTC/offset instants.
Ambiguous/nonexistent daylight-saving local times require an explicit offset.
Flight-number uniqueness is airline + departure airport-local date, not instant.

Round-trip segments must share a currency; P2 does not invent FX conversions.
Price comparison requires an explicit currency. Search without a cabin filter
returns eligible cabin offers. Prices use ISO currency codes and minor units.

PDF tickets are generated only for verified Confirmed/Completed bookings.
The default font supports the standard Latin test data; configure
`P2_TICKET_FONT_PATH` with an appropriate licensed font for other writing systems
and verify those scripts before deployment. P2 never displays passport numbers
in the PDF ticket. Passenger CSV exports are authorized and formula-neutralized.
