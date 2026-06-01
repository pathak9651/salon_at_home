# Salon At Home MVP

A startup-ready monorepo for at-home salon bookings with a dark sci-fi interface.

## Workspace

```text
salon-at-home/
|-- app/          # Expo mobile app for clients and salon owners
|-- backend/      # Express API, Prisma schema, and local PostgreSQL service
|-- admin-panel/  # Next.js platform operations dashboard
|-- database/     # Database setup notes
`-- docs/         # Architecture documentation
```

## Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop, or an existing PostgreSQL database

## Local Setup

1. Copy `backend/.env.example` to `backend/.env`.
2. Copy `app/.env.example` to `app/.env` only when the automatic Expo API host is unsuitable.
3. Copy `admin-panel/.env.example` to `admin-panel/.env.local` when the API is not running on `localhost:4000`.
4. Start PostgreSQL:

   ```sh
   docker compose -f backend/docker-compose.yml up -d
   ```

5. Install packages and initialize Prisma:

   ```sh
   npm install
   npm run prisma:generate --workspace backend
   npm run prisma:push --workspace backend
   npm run seed:admin --workspace backend
   ```

6. Start each application in a separate terminal:

   ```sh
   npm run dev:backend
   npm run dev:app
   npm run dev:admin
   ```

The API runs at `http://localhost:4000`, Expo prints its development URL, and the
admin panel runs at `http://localhost:3000`.

## Environment Notes

- `OTP_BYPASS_CODE=123456` keeps local authentication setup simple. Remove it in production and configure SMTP.
- Configure Razorpay keys before testing online payments.
- Cloudinary and Google Maps keys are reserved in `backend/.env.example` for the upcoming image upload and location integrations.
- Replace every example secret before deployment and serve production traffic over HTTPS.

## Validation

Run `npm run typecheck` for all workspaces and `npm run build` for production builds.
See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the MVP boundary.
