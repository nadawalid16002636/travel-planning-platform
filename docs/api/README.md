# API documentation

The API is documented with Swagger (Milestone 1 is evaluated through Swagger UI).

- Start the backend: `cd backend && npm run start:dev`
- Open http://localhost:3000/api/docs
- Log in with `POST /api/auth/login`; the browser keeps the httpOnly session cookies for the other calls.

Every endpoint summary starts with the requirement IDs it implements (see `docs/requirements/mandatory.csv`).
