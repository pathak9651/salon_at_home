# Salon At Home MVP Architecture

## Applications

- `app/`: Expo React Native app for clients and salon owners.
- `admin-panel/`: Next.js operations console for platform admins.
- `backend/`: Express API with JWT authentication, OTP email flows, Prisma, Razorpay order verification, and MVP domain routes.
- `database/`: database setup notes. The Prisma schema remains the source of truth.

## MVP Modules

| Module | API prefix | Purpose |
| --- | --- | --- |
| Auth | `/api/auth` | Signup, email verification, login, reset, session invalidation |
| Salons | `/api/salons` | Public discovery, owner salon registration, services |
| Bookings | `/api/bookings` | Client booking and owner lifecycle updates |
| Payments | `/api/payments` | Razorpay order creation and signature verification |
| Reviews | `/api/reviews` | Completed-booking reviews |
| Admin | `/api/admin` | Protected platform metrics and records |

## Deferred Features

Wallets, subscriptions, AI recommendations, live tracking, advanced analytics,
notifications, and microservices stay outside the MVP until product validation.
