# travel-planning-platform

P2 backend setup, requirement coverage, API endpoints and verification are in
[backend/P2_REVIEW.md](backend/P2_REVIEW.md). P1/P4 integration contracts and
isolated test instructions are in [backend/P2_INTEGRATION.md](backend/P2_INTEGRATION.md).

From `backend`, install dependencies, configure local `.env` from `.env.example`,
then run `npm run build`, `npm test -- --runInBand`, and `npm run start:dev`.
Swagger is served at `http://localhost:3000/api/docs` after database startup.
Never commit the team's MongoDB connection string or other secrets.
