# Swagger walkthrough: every role, end to end

A script for demonstrating the Milestone 1 API in Swagger UI. Follow it top to bottom: each part builds the data the
next part needs. Every request body is already filled in by its Swagger example (pick the named example from the
**Examples** dropdown when there is more than one); you only replace the placeholder ids.

**Open:** http://localhost:3000/api/docs

## How to use Swagger here

- **Logging in:** `POST /api/auth/login` sets httpOnly cookies, and the browser sends them with every later request.
  There is no Authorize button to fill in.
- **Switching roles:** call `POST /api/auth/logout`, then log in as the next account.
- **Ids:** copy the `_id` (or `id`) from a response and paste it into the next request's path or body. Keep a notepad
  open with these: `airlineId`, `flightId`, `hotelId`, `roomId`, `holdId`, `bookingId`, `paymentId`.
- **Errors** all use one shape: `{ statusCode, message, path, timestamp }` (P2 routes still differ, see the QA log).
- **Test accounts:** use `@test.local` emails if you create extra accounts; `npm run cleanup:test -- --apply` removes them.

---

## Part 1: Guest (not logged in)

| Step | Request | What it shows | Expect |
| --- | --- | --- | --- |
| 1.1 | `GET /api/health` | API is up | 200 `{ status: "ok" }` |
| 1.2 | `GET /api/reference/cities`, `/api/airports` | Official reference data (GEN-12), paginated (GEN-05) | 200 `{ data, page, limit, total }` |
| 1.3 | `GET /api/users/me` | Private routes need login | 401 "Login required" |
| 1.4 | `POST /api/auth/register` (example) | Self-registration (ACC-01) | 201 |
| 1.5 | `POST /api/auth/register` again | Unique email | 409 |

## Part 2: Admin sets up the platform

Log in: `POST /api/auth/login` → example **admin**.

| Step | Request | What it shows | Expect |
| --- | --- | --- | --- |
| 2.1 | `POST /api/airlines` | Create an airline (FLT-01). Save `airlineId` | 201 |
| 2.2 | `PUT /api/airlines/{id}/baggage-policy` | Baggage rules (FLT-08) | 200 |
| 2.3 | `PUT /api/airlines/{id}/cancellation-policy` | Refund tiers (FLT-09) | 200 |
| 2.4 | `POST /api/flights` (put `airlineId` in the body) | Schedule CAI → LHR. Save `flightId` | 201 |
| 2.5 | `POST /api/hotels` | Create a hotel (HTL-01). Save `hotelId` | 201 |
| 2.6 | `PUT /api/hotels/{id}/policies` | Check-in times and refund tiers (HTL-09, HTL-10) | 200 |
| 2.7 | `POST /api/hotels/{id}/rooms` | Add a room (HTL-03). Save `roomId` | 201 |
| 2.8 | `PATCH /api/hotels/{id}/rooms/{roomId}/availability` → example **open** | Open the room for booking (HTL-04) | 200 ⚠️ currently 404, see "Known issues" |
| 2.9 | `POST /api/admin/moderators` → example **hotel** (`providerId` = `hotelId`) | Moderator account (ACC-13) | 201 |
| 2.10 | `POST /api/admin/moderators` → example **airline** (`providerId` = `airlineId`) | | 201 |

## Part 3: Moderators manage only their own provider

**Hotel moderator.** Log out, log in → example **moderator**.

| Step | Request | What it shows | Expect |
| --- | --- | --- | --- |
| 3.1 | `GET /api/users/me` | A temporary password must be changed first (ACC-07a) | 403 `PASSWORD_CHANGE_REQUIRED` |
| 3.2 | `PATCH /api/auth/change-password` → example **moderator** | | 200 |
| 3.3 | `PATCH /api/hotels/{hotelId}` | Edit own hotel | 200 |
| 3.4 | `PATCH /api/hotels/{any other hotel id}` | Can't touch another hotel | 403 "You can only manage your assigned provider" |
| 3.5 | `PATCH /api/airlines/{airlineId}` | Can't touch airlines | 403 |
| 3.6 | `GET /api/admin/accounts` | Not an admin | 403 |

**Airline moderator.** Log out, log in with `ops.airline@example.com` / `TempPass#2026`, change the password the same way,
then: `PATCH /api/airlines/{airlineId}` → 200, `PATCH /api/hotels/{hotelId}` → 403.

## Part 4: Traveler books a flight

Log out, log in → example **traveler** (the account from step 1.4).

| Step | Request | What it shows | Expect |
| --- | --- | --- | --- |
| 4.1 | `PATCH /api/users/me` | Profile and preferred currency (ACC-09) | 200 |
| 4.2 | `GET /api/flights/search?departureAirport=CAI&arrivalAirport=LHR&departureDate=2026-12-20&adults=2&cabinClass=economy` | Search (FLT-11) | 200, the flight from 2.4 |
| 4.3 | `POST /api/flight-bookings/hold` → example **oneWay** (`flightId`) | Seats held temporarily (FLT-22). Save `holdId` | 201 |
| 4.4 | `POST /api/flight-bookings` (`holdId`) | Booking with passengers (FLT-19, FLT-21). Save `bookingId` | 201, status pending payment |
| 4.5 | `GET /api/bookings/flight/{bookingId}/policies` | Policies shown before payment (PAY-02) | 200 |
| 4.6 | `POST /api/bookings/flight/{bookingId}/accept-policies` | Acceptance recorded | 201 |
| 4.7 | `POST /api/payments` → example **flight** | Stripe PaymentIntent (PAY-01). Save `paymentId` | 201 (503 if no Stripe key) |
| 4.8 | Confirm the payment in Stripe test mode (see below) | Webhook confirms the booking | |
| 4.9 | `GET /api/flight-bookings/{bookingId}` | Booking is Confirmed, has a reference (FLT-21) | 200 |
| 4.10 | `GET /api/flight-bookings/{bookingId}/e-ticket` | PDF e-ticket (FLT-23) | 200 PDF |
| 4.11 | `GET /api/flight-bookings/{bookingId}/cancellation-quote` | Refund preview (FLT-26) | 200 |
| 4.12 | `GET /api/notifications` | In-app notification (GEN-01) | 200 |

**Confirming a payment without a frontend:** set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (test mode) in
`backend/.env`, run `stripe listen --forward-to localhost:3000/api/payments/webhook`, then
`stripe payment_intents confirm <pi_... id> --payment-method pm_card_visa`.

## Part 5: Traveler books a hotel ⚠️ blocked until the room bug is fixed

| Step | Request | What it shows | Expect |
| --- | --- | --- | --- |
| 5.1 | `GET /api/hotels/search?city=cairo&checkIn=2026-12-20&checkOut=2026-12-23&guests=2` | Search (HTL-11, HTL-12) | 200, the hotel from 2.5 |
| 5.2 | `GET /api/hotels/{hotelId}/rooms/available?checkIn=2026-12-20&checkOut=2026-12-23` | Rooms and total price (HTL-15) | 200 |
| 5.3 | `POST /api/hotel-bookings` (`hotelId`, `roomId`) | Booking (HTL-16) | 201 |
| 5.4 | `POST /api/payments` → example **hotel** | Payment | 201 |
| 5.5 | `GET /api/hotel-bookings` | Upcoming / past / cancelled lists | 200 |

## Part 6: Privacy between users

Log out, register and log in as a second traveler (any `@test.local` email).

| Step | Request | Expect |
| --- | --- | --- |
| 6.1 | `GET /api/flight-bookings/{first traveler's bookingId}` | 403 |
| 6.2 | `GET /api/flight-bookings/{bookingId}/e-ticket` | 403 |
| 6.3 | `POST /api/payments` with the first traveler's `bookingId` | 403 "You do not own this booking" |
| 6.4 | `GET /api/flight-bookings` | Only this user's own (empty) list |

## Part 7: Admin oversight

Log out, log in → example **admin**.

| Step | Request | What it shows | Expect |
| --- | --- | --- | --- |
| 7.1 | `GET /api/admin/accounts?search=sara` | Search accounts (ACC-14). Save the traveler's `id` | 200 |
| 7.2 | `GET /api/admin/bookings?type=flight` | All bookings, read-only (ACC-17) | 200 |
| 7.3 | `PATCH /api/admin/accounts/{id}/suspend` | Suspend (ACC-15) | 200 |
| 7.4 | Log out, log in as the traveler | Suspended accounts can't log in | 403 "This account is suspended" |
| 7.5 | Log in as admin, `PATCH /api/admin/accounts/{id}/reactivate` | | 200 |
| 7.6 | `POST /api/admin/users/{id}/reset-password` | Admin-assisted reset (ACC-07a), returns a temporary password | 200 |
| 7.7 | `PATCH /api/admin/providers/hotel/{hotelId}/deactivate` | Hotel hidden from search (ACC-15) | 200 |
| 7.8 | `GET /api/admin/audit-logs` | Every admin action is logged (GEN-07) | 200 |
| 7.9 | `GET /api/admin/reports` | Moderation queue (GEN-10) | 200 |

## Part 8: Security checks to show

| Check | How | Expect |
| --- | --- | --- |
| Account lock (ACC-05) | Log in with a wrong password 5 times | 5th try: 403 "Account locked after 5 failed attempts" |
| No privilege escalation | `POST /api/auth/register` with an extra `"role": "admin"` | 400 "property role should not exist" |
| Bad ids | `GET /api/hotel-bookings/abc` | 400 "Invalid id" |
| Upload rules (GEN-08) | `POST /api/uploads` with a GIF, or a file over 5 MB | 400 / 413 |
| Forged payment webhook | `POST /api/payments/webhook` without a Stripe signature | 400 |

## Not covered yet

- **Blog (BLG-01..12), itineraries and currency conversion (ITN):** the P5 modules are still empty on `develop`.
- **Reports once per item (GEN-09):** needs a post, comment, review or itinerary to report.

## Known issues (see docs/qa/PERMISSION_TESTS.md)

- New hotel rooms can't be found after creation (`@Prop({ type: Types.ObjectId })` becomes Mixed), which blocks steps 2.8 and Part 5.
- P2 error responses and `GET /api/flight-bookings` use a different shape from the rest of the API.
- `GET /api/hotels` is not paginated.
