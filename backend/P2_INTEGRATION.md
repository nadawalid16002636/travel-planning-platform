# P2 integration contracts

## Setup and local verification

Use Node.js compatible with the merged NestJS 12 backend and the existing lockfile. From `backend`:

```sh
npm ci
npm run build
npm test
npm run test:e2e
```

On Windows PowerShell with script execution disabled, use `npm.cmd`.
The integration tests start a disposable, loopback-only MongoDB replica set;
they never connect to the team Atlas database. The merged-app smoke test imports AppModule with an explicit disposable database URI.
The first run downloads MongoDB into ignored `node_modules/.cache/mongodb-binaries`.
Network access is needed once. `MONGOMS_SYSTEM_BINARY` can point to an already
installed compatible MongoDB binary when downloads are unavailable. Tests fail,
rather than silently skip, if the replica set cannot start.

Copy `.env.example` to `.env`, obtain the team URI securely, and run the
insert-only airport importer described in [data/README.md](data/README.md).
Then `npm run start:dev` serves Swagger at `http://localhost:3000/api/docs`.
App startup requires Atlas connectivity. All HTTP endpoints use the `/api` prefix.
The application retains the existing global ValidationPipe and Swagger setup.

Atlas must support sessions and multi-document transactions. No standalone
MongoDB fallback is used because it would compromise round-trip atomicity.
Unique indexes must build successfully before accepting traffic. Existing
duplicate records require team-leader reconciliation; no migration deletes data.

## P1: authentication and assignment

The merged application uses P1's global AuthGuard and RolesGuard. P2SessionBridge
maps only the database-verified request user into P2's principal: admin/user roles
are retained and airline_moderator maps to airline-moderator with its providerId.
P1 enforces session expiry, suspension, deactivation and password-change rules.
P2Access still denies private access when no trusted adapter is registered.
Public airport, flight search/details and airline detail routes use @Public().
P2 ownership and assigned-airline checks remain in the services.

The merged-app smoke test boots AppModule against a disposable database and uses
explicit test-only P1 service overrides to check public access, guest rejection,
admin access and hotel-moderator rejection. Real cookie/browser and Atlas smoke
testing remains pending. Payment, audit and deactivation coordination still need
team verification; the session bridge does not claim those integrations.

P2 and P1 use the same canonical Airport model with string IATA _id. P2 accepts
existing P1 airport records and retains optional official metadata on insert.
GET /airports is registered once through P2; /reference/airports remains available.

## P4: payment, refund and notification integration

P4 is integrated locally from `feature/P4-payments-notifications-uploads-reports`
(2026-11-13). PaymentsModule imports P2Module; its worker consumes flight events
and refund requests every 15 seconds. Webhooks verify signatures, retrieve the
current Stripe PaymentIntent and check its registered amount, currency and owner.
Flight notifications use the event ID for durable deduplication. Build the new
unique sparse notification index before enabling workers. Live Stripe test-mode
and shared Atlas smoke tests remain pending.

There are no P2
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
