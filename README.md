# Travel Planning and Booking Platform

GIU Software Project I, Winter 2026. NestJS + MongoDB Atlas backend, Next.js frontend.

## Setup

Requirements: Node.js 20+ and Git.

```bash
git clone <repo-url>
cd <repo>/backend
npm install
cp ../.env.example .env      # then paste the real values from the team lead
npm run start:dev
```

- API: http://localhost:3000/api
- Swagger: http://localhost:3000/api/docs
- Health check: http://localhost:3000/api/health

`backend/.npmrc` sets `legacy-peer-deps=true`, so a plain `npm install` works.

## Project structure

```
backend/src/
├── common/          shared code — only the team lead edits it
│   ├── roles.ts                 Role enum, JwtUser type
│   ├── decorators.ts            @Public(), @Roles(), @CurrentUser(), @ApiErrors()
│   ├── guards.ts                AuthGuard, RolesGuard, assertOwner(), assertProvider()
│   ├── all-exceptions.filter.ts one error format for the whole API
│   └── pagination.dto.ts        PaginationQueryDto, paginate()
├── auth/ users/ admin/ audit/                 P1
├── airlines/ flights/ flight-bookings/        P2
├── hotels/ hotel-bookings/ reviews/           P3
├── payments/ notifications/ uploads/ reports/ P4
├── itineraries/ posts/ fx/                    P5
└── app.module.ts    every module is already imported here
```

## Requirements

The official requirements are in `docs/requirements/mandatory.csv` and `bonus.csv`. They are the source of truth
for every limit and rule. Put the requirement ID in your commit messages and Swagger summaries.

## Sessions (ACC-06, ACC-19)

Login sets two httpOnly cookies: a 15-minute access token and a refresh token. The access token is renewed
automatically on any request while the session is active. 30 minutes without requests ends the session.
In Swagger, call `POST /api/auth/login` once; the browser sends the cookies on every later call.
Accounts with a temporary password get `403 PASSWORD_CHANGE_REQUIRED` until they call `PATCH /api/auth/change-password`.
After 5 failed logins the account is locked for 15 minutes (ACC-05).

Cookies are `Secure`: browsers accept them on `http://localhost`, but CLI tools like PowerShell's
`Invoke-WebRequest` do not send them over http. Use Swagger, the browser, or `curl -c jar -b jar`.

## Reference data (GEN-12)

Countries, cities, airports, attractions and currencies are loaded from `backend/seed-data/*.csv` on every
start (or `npm run seed`). Each record keeps its official id as `_id`:

| Collection | `_id` example | Use it as |
| --- | --- | --- |
| countries | `EG` | `countryCode` |
| cities | `cairo` | `cityId` (hotels, itineraries) |
| airports | `CAI` | `departureAirport` / `arrivalAirport`; has `timeZone` for GEN-06 |
| attractions | `att-1` | itinerary activities |
| currencies | `EGP` | prices, preferences |

Validate ids with the global `ReferenceService` (`await this.reference.airport('CAI')` throws 404 if unknown).
Public endpoints: `GET /api/reference/{countries,cities,airports,attractions,currencies}` and `GET /api/airports`.
Lists are paginated like every other list (GEN-05): `?page=1&limit=10` returns `{ data, page, limit, total }`.

## Test data

`npm run cleanup:test` (in `backend/`) lists the accounts whose email ends with `@test.local`, plus their
sessions. `npm run cleanup:test -- --apply` deletes them. Use `@test.local` emails when you test in Swagger.

## Rules for coding

**Auth is on by default.** Every endpoint needs a logged-in user unless you mark it `@Public()`.

```ts
@Public()                       // guests allowed (search, public posts, login...)
@Roles(Role.AIRLINE_MOD)        // only this role
@Get(':id')
find(@Param('id') id: string, @CurrentUser() user: JwtUser) { ... }
```

- Private data (bookings, itineraries, drafts): call `assertOwner(doc.userId, user)`.
- Validate `:id` params with `ParseObjectIdPipe`.
- Booking modules: register an ACC-12 check with `usersService.registerDeactivationCheck(...)` (see users.service.ts).
- Moderators: call `assertProvider(airlineOrHotelId, user)`.
- Validate every body and query with a DTO and `class-validator`. Unknown fields are rejected.
- List endpoints extend `PaginationQueryDto` and return `paginate(data, total, query)`.
- Throw Nest exceptions (`NotFoundException`, `ConflictException`, ...); the global filter formats them.
- Document error responses in Swagger with `@ApiErrors(400, 401, [404, 'Flight not found'])`.
- Imports use the `.js` extension (the project is ESM): `import { X } from './x.service.js';`

**Shared services** are global, so inject them without importing their module:

| Service | Owner | Use |
| --- | --- | --- |
| `AuditService.log(actorId, action, targetType, targetId, meta?)` | P1 | every important admin/moderator action |
| `NotificationsService.notify(userId, type, payload)` | P4 | booking confirmed, flight cancelled, refund, suspension |
| `UploadsService.validateAndStore(file, { purpose, entityId, user })` | P4 | JPG/PNG, 5 MB, 5 images or 1 airline logo |
| `PaymentsService.createPayment(...)`, `refundFor(...)` | P4 | hotel bookings; flights use the webhook and the P2 outbox |

Hotel bookings register a payment handler so the Stripe webhook can confirm or release a hold:

```ts
onModuleInit() {
  this.payments.registerHandler('hotel', {
    confirm: (bookingId, paymentId) => this.confirm(bookingId, paymentId),
    fail: (bookingId) => this.fail(bookingId),
  });
}
```

Flights do not use that handler. P4 verifies the Stripe webhook, then calls `BookingsService.applyVerifiedPayment`, and polls `pendingEvents()` / `pendingRefunds()`. See [P2 integration](backend/P2_INTEGRATION.md).

## P4 payments, notifications, uploads, reports

Stripe test mode only. Card numbers stay in Stripe Elements; the API stores the PaymentIntent id, amount, currency and status.

| Method | Path | Requirement |
| --- | --- | --- |
| GET | `/api/bookings/:type/:id/policies` | PAY-02 |
| POST | `/api/bookings/:type/:id/accept-policies` | PAY-02 |
| POST | `/api/payments` | PAY-01. Body: `{ bookingType, bookingId }`. Amount is read from the booking |
| POST | `/api/payments/:id/retry` | PAY-01. Same PaymentIntent until the 10-minute hold ends |
| GET | `/api/payments/:id` | PAY-01, PAY-03 |
| POST | `/api/payments/webhook` | PAY-01. Stripe signature, raw body |
| GET | `/api/refunds/:id` | PAY-03. Status is `Pending`, `Refunded` or `Failed` |
| GET | `/api/notifications` | GEN-01 |
| GET | `/api/notifications/unread-count` | GEN-01 |
| PATCH | `/api/notifications/:id/read` | GEN-01 |
| POST | `/api/uploads?purpose=&entityId=` | GEN-08. Multipart field `file` |
| POST | `/api/reports` | GEN-09 |
| GET | `/api/admin/reports` | GEN-10 |
| PATCH | `/api/admin/reports/:id` | GEN-10. `{ action: dismiss \| hide \| delete }` |
| DELETE | `/api/admin/content/:type/:id` | GEN-10 |

`bookingType` / `:type` on the payment routes is `flight` or `hotel`. Report content types are `post`, `comment`, `review` or `itinerary`. Upload purposes are `airline-logo`, `hotel`, `post` or `activity`.

Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `PLATFORM_CURRENCY` in `backend/.env`. Forward Stripe test events with `stripe listen --forward-to localhost:3000/api/payments/webhook`.

## Git workflow

```bash
git checkout develop && git pull
git checkout -b feature/FLT-11-flight-search
# work, then:
git add . && git commit -m "feat(flights): add round-trip search (FLT-11)"
git push -u origin feature/FLT-11-flight-search
# open a PR into develop on GitHub, mention the requirement IDs
```

- Never commit `.env`.
- Only touch your own module folders; changes to `common/` or `app.module.ts` go through the team lead.
- Log the AI prompts you used in `AI_PROMPTS.txt` with the requirement ID.

## P2 airlines, flights and bookings

See [integration contracts](backend/P2_INTEGRATION.md) and [review handoff](backend/P2_REVIEW.md).
