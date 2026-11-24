# Traveler flight frontend

Start the NestJS backend, then run these commands from `frontend/`.

```powershell
Copy-Item .env.example .env.local
npm.cmd ci
npm.cmd run dev -- --port 3001
```

Open `http://localhost:3001/flights`. Set `BACKEND_API_URL` in `.env.local` if the backend runs at a different URL. The backend must have its reference airports and scheduled flights seeded for results to appear.

Search and detail pages render on demand with uncached backend requests. Search criteria are stored in the URL so travelers can share a search or return to it from a flight detail page.

Use a traveler account to start a hold and access My Flight Bookings. The flight sign-in page uses the existing NestJS session and its HTTP-only cookies through same-origin rewrites. The booking pages load private data with that session in the browser.

Set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to the Stripe test publishable key paired with the backend's test account. Restart the development server after changing it. For a production build, configure both frontend variables before running `npm.cmd run build`.

For a local test payment, configure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in the backend and forward Stripe events to `http://localhost:3000/api/payments/webhook`. A booking stays pending until the backend verifies the payment. The confirmed booking page shows its reference and a PDF download. The cancellation flow displays the backend refund quote and requires confirmation before cancelling the booking.
