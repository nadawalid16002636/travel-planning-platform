# Tripwise frontend

Next.js App Router frontend for the travel platform.

## Local development

1. Start the backend on `http://localhost:3000`.
2. Copy `.env.example` to `.env.local` and add the Stripe **test** publishable key.
3. Install and start the frontend:

   ```sh
   npm ci
   npm run dev -- --port 3001
   ```

The backend's `FRONTEND_URL` must allow `http://localhost:3001` with credentials.
Do not put Stripe secret keys, database credentials, or other server secrets in
this app. The API uses the backend's httpOnly session cookies.

## Traveler routes

- `/` and `/hotels` — hotel search and results
- `/hotels/[id]` — hotel details, rooms, policies and paginated guest reviews
- `/hotels/[id]/book` — guest assignment, policy acceptance and Stripe checkout
- `/my-reservations` — upcoming, past and cancelled reservations
- `/my-reservations/[id]` — details, cancellation/refund preview and review management
- `/login` — minimal integration with the existing backend login endpoint
- `/flights` — search flights by route, date, passengers, cabin and price
- `/flights/[id]` — flight details, cabin fares and baggage policies
- `/flights/checkout` — hold, passenger details, payment and booking confirmation
- `/flights/bookings` — flight booking history and cancellation/refund preview

Registration and the wider profile/settings experience belong to the shared P1
frontend foundation and can be integrated without changing the P3 API client.

Start the backend, then install and run the frontend from `frontend/`:

```powershell
Copy-Item .env.example .env.local
npm.cmd ci
npm.cmd run dev -- --port 3001
```

The backend's `FRONTEND_URL` must allow `http://localhost:3001` with credentials.
Set `BACKEND_API_URL` in `.env.local` if the backend is not at
`http://localhost:3000/api`; flight requests use same-origin `/travel-api`
rewrites, while the hotel API uses `NEXT_PUBLIC_API_BASE_URL`.
The backend must have reference airports and scheduled flights seeded for
flight results to appear.

Set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to the Stripe test publishable key.
Keep Stripe secret keys and database credentials in the backend only. For local
flight payments, configure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in
the backend and forward Stripe events to
`http://localhost:3000/api/payments/webhook`. A flight booking remains pending
until the backend verifies payment.
