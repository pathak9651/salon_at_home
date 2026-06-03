import { PrismaClient } from "@prisma/client";
import { prisma } from "../config/prisma";

const defaultPlans = [
  {
    code: "BASIC_MONTHLY",
    name: "Basic Monthly",
    monthlyPrice: 499,
    servicesPerMonth: 2,
    description: "Monthly care package for essential grooming.",
    benefits: ["2 home services per month", "Priority booking slots", "Digital invoices"],
  },
  {
    code: "PLUS_MONTHLY",
    name: "Plus Monthly",
    monthlyPrice: 899,
    servicesPerMonth: 4,
    description: "Balanced package for regular salon-at-home needs.",
    benefits: ["4 home services per month", "Priority booking slots", "Member support", "Service reminders"],
  },
  {
    code: "FAMILY_MONTHLY",
    name: "Family Monthly",
    monthlyPrice: 1499,
    servicesPerMonth: 8,
    description: "Monthly family package for multiple home services.",
    benefits: ["8 home services per month", "Priority booking slots", "Family service planning", "Member support"],
  },
];

type Tx = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export async function ensureMembershipPlans(client: Tx = prisma) {
  for (const plan of defaultPlans) {
    await client.membershipPlan.upsert({
      where: { code: plan.code },
      update: { ...plan, isActive: true },
      create: plan,
    });
  }
}

export async function getMembershipPlans() {
  await ensureMembershipPlans();
  return prisma.membershipPlan.findMany({ where: { isActive: true }, orderBy: { monthlyPrice: "asc" } });
}
