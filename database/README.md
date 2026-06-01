# Database

The MVP uses PostgreSQL through Prisma. The canonical schema is
[`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma).

Initial models: `User`, `Salon`, `Service`, `Booking`, `Payment`, and `Review`.

Start PostgreSQL locally:

```sh
docker compose -f backend/docker-compose.yml up -d
npm run prisma:generate --workspace backend
npm run prisma:push --workspace backend
```
