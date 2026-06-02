import { UserRole } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../utils/async-handler";

const router = Router();
router.use(requireAuth, requireRole(UserRole.ADMIN));

router.get("/overview", asyncHandler(async (_req, res) => {
  const [users, salons, bookings, payments, onlinePayments, cashPayments] = await Promise.all([
    prisma.user.count(),
    prisma.salon.count(),
    prisma.booking.count(),
    prisma.payment.aggregate({ _sum: { amount: true, platformFee: true, merchantAmount: true }, where: { status: "PAID" } }),
    prisma.payment.count({ where: { status: "PAID", method: "ONLINE" } }),
    prisma.payment.count({ where: { status: "PAID", method: "CASH" } }),
  ]);
  res.json({
    users,
    salons,
    bookings,
    revenue: payments._sum.amount ?? 0,
    brokerage: payments._sum.platformFee ?? 0,
    merchantPayouts: payments._sum.merchantAmount ?? 0,
    onlinePayments,
    cashPayments,
  });
}));

router.get("/users", asyncHandler(async (_req, res) => {
  res.json(await prisma.user.findMany({
    select: { id: true, name: true, phone: true, email: true, emailVerified: true, role: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "desc" },
  }));
}));

router.get("/bookings", asyncHandler(async (_req, res) => {
  res.json(await prisma.booking.findMany({ include: { client: true, salon: true, payment: true }, orderBy: { createdAt: "desc" } }));
}));

router.get("/payments", asyncHandler(async (_req, res) => {
  res.json(await prisma.payment.findMany({
    where: { status: "PAID" },
    include: {
      booking: {
        include: {
          client: { select: { id: true, name: true, phone: true, email: true } },
          salon: { include: { owner: { select: { id: true, name: true, phone: true, email: true } } } },
          service: true,
          services: { include: { service: true } },
        },
      },
    },
    orderBy: { paidAt: "desc" },
  }));
}));

export default router;
