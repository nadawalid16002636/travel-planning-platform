# Permission-leak test checklist (P6 QA)

Built from the endpoints on `develop` (commit dd534e3). Run everything in Swagger: http://localhost:3000/api/docs
Use `@test.local` emails only, and clean up afterwards with `npm run cleanup:test -- --apply`.

Status key: ✅ pass · ❌ fail (open a bug) · ⏳ not testable yet

## 0. Test accounts to create

| Name | Role | How |
| --- | --- | --- |
| admin | admin | seeded on first start (ask the lead for the ADMIN_EMAIL / ADMIN_PASSWORD in use) |
| userA@test.local | user | `POST /api/auth/register` |
| userB@test.local | user | `POST /api/auth/register` |
| hotelModA@test.local | hotel_moderator, hotel A | admin: `POST /api/admin/moderators` |
| hotelModB@test.local | hotel_moderator, hotel B | admin: `POST /api/admin/moderators` |
| airlineModA@test.local | airline_moderator, airline A | admin: `POST /api/admin/moderators` |
| airlineModB@test.local | airline_moderator, airline B | admin: `POST /api/admin/moderators` |

Switch accounts with `POST /api/auth/logout` then `POST /api/auth/login`.

## 1. Guest (logged out) → expect 401

| # | Request | Expect | Status |
| --- | --- | --- | --- |
| G1 | `GET /api/users/me` | 401 | |
| G2 | `GET /api/auth/me` | 401 | |
| G3 | `GET /api/hotel-bookings` | 401 | |
| G4 | `GET /api/flight-bookings` | 401 | |
| G5 | `GET /api/flight-bookings/{any id}` | 401. **Check this one:** the route is marked `@Public()` and relies on the P2 class guard to block guests | |
| G6 | `POST /api/hotels` | 401 | |
| G7 | `GET /api/admin/accounts` | 401 | |
| G8 | Public routes still work: `GET /api/hotels`, `/api/hotels/search`, `/api/airports`, `/api/reference/cities`, `/api/health` | 200 | |

## 2. Registered user → admin / provider routes → expect 403

| # | As | Request | Expect | Status |
| --- | --- | --- | --- | --- |
| U1 | userA | `GET /api/admin/accounts` | 403 | |
| U2 | userA | `POST /api/admin/moderators` | 403 | |
| U3 | userA | `GET /api/admin/bookings` | 403 | |
| U4 | userA | `POST /api/hotels` | 403 | |
| U5 | userA | `PATCH /api/hotels/{hotelA}` | 403 | |
| U6 | userA | `POST /api/airlines` | 403 | |
| U7 | userA | `PATCH /api/airlines/{airlineA}` | 403 | |
| U8 | userA | `POST /api/flights` | 403 | |
| U9 | userA | `GET /api/hotels/{hotelA}/reservations` | 403 | |

## 3. User A vs User B (ownership) → expect 403 or 404, never the data

| # | As | Request | Expect | Status |
| --- | --- | --- | --- | --- |
| O1 | userB | `GET /api/hotel-bookings/{userA booking}` | 403/404 | |
| O2 | userB | `POST /api/hotel-bookings/{userA booking}/cancel` | 403/404 | |
| O3 | userB | `GET /api/flight-bookings/{userA booking}` | 403/404 | |
| O4 | userB | `GET /api/flight-bookings/{userA booking}/e-ticket` | 403/404 | |
| O5 | userB | `PATCH /api/reviews/{userA review}` | 403/404 | |
| O6 | userB | `DELETE /api/reviews/{userA review}` | 403/404 | |
| O7 | userB | `GET /api/hotel-bookings` | only userB's own bookings | |
| O8 | userB | `POST /api/hotel-bookings/{userA booking}/review` | 403/404 | |

## 4. Moderator A vs provider B → expect 403

| # | As | Request | Expect | Status |
| --- | --- | --- | --- | --- |
| M1 | hotelModA | `PATCH /api/hotels/{hotelB}` | 403 | |
| M2 | hotelModA | `POST /api/hotels/{hotelB}/rooms` | 403 | |
| M3 | hotelModA | `PUT /api/hotels/{hotelB}/policies` | 403 | |
| M4 | hotelModA | `GET /api/hotels/{hotelB}/reservations` | 403 | |
| M5 | hotelModA | `GET /api/hotels/{hotelB}/availability` | 403 | |
| M6 | airlineModA | `PATCH /api/airlines/{airlineB}` | 403 | |
| M7 | airlineModA | `PUT /api/airlines/{airlineB}/cancellation-policy` | 403 | |
| M8 | airlineModA | `POST /api/flights` with `airlineId` = airline B | 403 | |
| M9 | airlineModA | `GET /api/flights/{airlineB flight}/bookings` | 403 | |
| M10 | hotelModA | `PATCH /api/airlines/{airlineA}` (wrong provider type) | 403 | |
| M11 | airlineModA | `PATCH /api/hotels/{hotelA}` (wrong provider type) | 403 | |
| M12 | hotelModA / airlineModA | `GET /api/admin/accounts` | 403 | |
| M13 | hotelModA / admin | `DELETE /api/users/me` (only registered users may deactivate) | 403 | |
| M14 | hotelModA / airlineModA | `POST /api/hotel-bookings`, `POST /api/flight-bookings/hold` (moderators can't book) | 403 | |

## 5. Account state

| # | Case | Expect | Status |
| --- | --- | --- | --- |
| S1 | 5 wrong passwords for userA, then the right one (ACC-05) | locked for 15 min | |
| S2 | Admin suspends userA while userA is logged in elsewhere | userA's next request → 401 | |
| S3 | Suspended userA logs in | rejected | |
| S4 | Admin resets userA's password, userA logs in with the temp password and calls anything | `403 PASSWORD_CHANGE_REQUIRED` until `PATCH /api/auth/change-password` | |
| S5 | userA deactivates with an upcoming Confirmed booking (ACC-12) | blocked | |
| S6 | Deactivated userA logs in | rejected | |
| S7 | Admin deactivates hotel A | hotel A gone from `/api/hotels/search`, cannot be booked | |

## 6. Input validation (any role)

| # | Case | Expect | Status |
| --- | --- | --- | --- |
| V1 | Any `:id` = `abc` | 400, not 500 | |
| V2 | Body with an unknown extra field, e.g. `"role": "admin"` on register or `PATCH /api/users/me` | 400, role unchanged | |
| V3 | `?limit=1000` on a list | capped / 400 | |
| V4 | Every error has the same JSON shape (global filter) | consistent | |

## 7. Blog (BLG-01..12): ⏳ waiting on P5's `posts` module (empty on develop)

When it lands: guest can't like/comment/report (401), userB can't edit/delete userA's post or comment, drafts are invisible to others,
hidden posts are visible only to the author and admins (GEN-10), one like per user (BLG-06), one report per item (GEN-09), comment max 500 chars (BLG-05), max 5 tags × 30 chars (BLG-08).

---

## Run log: 11 Nov 2026, local in-memory DB, develop @ dd534e3

| # | Result | Notes |
| --- | --- | --- |
| G1–G7 | ✅ | all 401 |
| G5 | ✅ | 401 "P1 verified authentication is required"; the class-level P2 guard blocks guests despite `@Public()` |
| G8 | ✅ | public routes 200 |
| U1–U4 | ✅ | 403 "Not allowed for your role" |
| U6 | ✅ | 403 (with a valid body; an empty body returns 400 first because validation runs before the role check) |
| V1 | ✅ | `abc` id → 400 |
| V2 | ✅ | `role` field rejected on register and `PATCH /users/me` |
| Duplicate email | ✅ | 409 |

### Bugs found

1. **Inconsistent error format (GEN shared behaviour: "consistent error responses").** P1/P3 routes return
   `{ statusCode, message, path, timestamp, errors? }` from the global filter, but P2 routes (airlines, flights, flight-bookings)
   return Nest's default `{ message, error, statusCode }`, without `path`/`timestamp`. Example: `GET /api/flight-bookings` as a guest,
   or `POST /api/airlines` as a user. Likely cause: `@UseFilters(P2ErrorFilter)` overrides the global filter. Owner: P2.
2. **`GET /api/hotels` is not paginated (GEN-05).** It returns a bare array `[]` instead of `{ data, page, limit, total }`, and accepts
   `limit=1000` with 200. Recheck once hotels exist. Owner: P3.
