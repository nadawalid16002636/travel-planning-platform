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

## P3 traveler routes

- `/` and `/hotels` — hotel search and results
- `/hotels/[id]` — hotel details, rooms, policies and paginated guest reviews
- `/hotels/[id]/book` — guest assignment, policy acceptance and Stripe checkout
- `/my-reservations` — upcoming, past and cancelled reservations
- `/my-reservations/[id]` — details, cancellation/refund preview and review management
- `/login` — minimal integration with the existing backend login endpoint

Registration and the wider profile/settings experience belong to the shared P1
frontend foundation and can be integrated without changing the P3 API client.
