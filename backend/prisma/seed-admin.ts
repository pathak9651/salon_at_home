import bcrypt from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";
import { env } from "../src/config/env";

const prisma = new PrismaClient();

async function seedAdmin() {
  await prisma.$runCommandRaw({
    update: "User",
    updates: [{
      q: { sessionVersion: { $exists: false } },
      u: { $set: { sessionVersion: 0 } },
      multi: true,
    }],
  });

  const password = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
  const admin = await prisma.user.upsert({
    where: { email: env.ADMIN_EMAIL.toLowerCase() },
    update: {
      name: env.ADMIN_NAME,
      phone: env.ADMIN_PHONE,
      password,
      role: UserRole.ADMIN,
    },
    create: {
      name: env.ADMIN_NAME,
      email: env.ADMIN_EMAIL.toLowerCase(),
      phone: env.ADMIN_PHONE,
      password,
      role: UserRole.ADMIN,
    },
  });

  console.log(`Admin account ready: ${admin.email}`);
}

seedAdmin()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
