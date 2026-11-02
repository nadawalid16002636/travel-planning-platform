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
│   ├── decorators.ts            @Public(), @Roles(), @CurrentUser()
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

## Rules for coding

**Auth is on by default.** Every endpoint needs a logged-in user unless you mark it `@Public()`.

```ts
@Public()                       // guests allowed (search, public posts, login...)
@Roles(Role.AIRLINE_MOD)        // only this role
@Get(':id')
find(@Param('id') id: string, @CurrentUser() user: JwtUser) { ... }
```

- Private data (bookings, itineraries, drafts): call `assertOwner(doc.userId, user)`.
- Moderators: call `assertProvider(airlineOrHotelId, user)`.
- Validate every body and query with a DTO and `class-validator`. Unknown fields are rejected.
- List endpoints extend `PaginationQueryDto` and return `paginate(data, total, query)`.
- Throw Nest exceptions (`NotFoundException`, `ConflictException`, ...); the global filter formats them.
- Imports use the `.js` extension (the project is ESM): `import { X } from './x.service.js';`

**Shared services** are global, so inject them without importing their module:

| Service | Owner | Use |
| --- | --- | --- |
| `AuditService.log(actorId, action, targetType, targetId, meta?)` | P1 | every important admin/moderator action |
| `NotificationsService.notify(userId, type, payload)` | P4 | booking confirmed, flight cancelled, report handled... |
| `UploadsService.validateAndStore(file)` | P4 | activity and post images |
| `PaymentsService.createPayment(...)`, `refundFor(...)` | P4 | flight and hotel bookings |

Booking modules register a payment handler once, so the Stripe webhook can confirm or fail bookings:

```ts
onModuleInit() {
  this.payments.registerHandler('flight', {
    confirm: (bookingId, paymentId) => this.confirm(bookingId, paymentId),
    fail: (bookingId) => this.failAndRelease(bookingId),
  });
}
```

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
