import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./config/prisma";
import { attachSupportWebSocket } from "./modules/support/support.ws";

const server = app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`Salon At Home API listening on port ${env.PORT}`);
});

server.requestTimeout = 15_000;
server.headersTimeout = 16_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 100;
attachSupportWebSocket(server);

async function shutdown() {
  server.close();
  await prisma.$disconnect();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
