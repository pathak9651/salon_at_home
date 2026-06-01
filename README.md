# Salon At Home MVP

A minimal startup scaffold with one Expo app and one Express backend.

## Structure

```text
salon-at-home/
|-- app/       # Client, salon owner, and admin mobile interfaces
`-- backend/   # API, auth, Prisma database, payments, and admin controls
```

## Quick Start

1. Copy `backend/.env.example` to `backend/.env`.
2. Start MongoDB with `docker compose -f backend/docker-compose.yml up -d`.
3. Run `npm install`.
4. Run `npm run prisma:generate --workspace backend`.
5. Run `npm run prisma:push --workspace backend`.
6. Configure the admin values in `backend/.env`.
7. Run `npm run seed:admin --workspace backend`.
8. Start the API with `npm run dev:backend`.
9. Start Expo with `npm run dev:app`.

The API starts on `http://localhost:4000`. The Expo app routes authenticated users into client, merchant, or admin interfaces.

When using Expo Go on a physical phone, keep the phone and development computer on the same Wi-Fi network. The app resolves the Expo development host automatically. To override it, copy `app/.env.example` to `app/.env` and set `EXPO_PUBLIC_API_URL`.

## MongoDB

The local Docker setup initializes a single-node MongoDB replica set because Prisma uses transactions for nested writes. For production, replace `DATABASE_URL` in `backend/.env` with your MongoDB Atlas connection string and keep the database name in the URL.

## Authentication

The Expo app supports client signup, merchant signup, login, secure device session storage, and logout. Merchants are stored with the backend `OWNER` role. Admin accounts cannot be created from the public app; use the idempotent `seed:admin` command after configuring `ADMIN_EMAIL`, `ADMIN_PHONE`, and `ADMIN_PASSWORD`.
