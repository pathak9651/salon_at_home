import { UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../utils/async-handler";
import { HttpError } from "../../utils/http-error";

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
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      emailVerified: true,
      role: true,
      isSuspended: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { salons: true, bookings: true } },
    },
    orderBy: { createdAt: "desc" },
  }));
}));

router.patch("/users/:id/suspension", asyncHandler(async (req, res) => {
  const data = z.object({ isSuspended: z.boolean() }).parse(req.body);
  const id = String(req.params.id);
  if (id === req.user!.id && data.isSuspended) throw new HttpError(400, "You cannot suspend your own admin account");
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "User not found");
  const user = await prisma.user.update({
    where: { id },
    data: { isSuspended: data.isSuspended, sessionVersion: { increment: 1 } },
    select: { id: true, name: true, phone: true, email: true, emailVerified: true, role: true, isSuspended: true, createdAt: true, updatedAt: true },
  });
  res.json(user);
}));

router.delete("/users/:id", asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  if (id === req.user!.id) throw new HttpError(400, "You cannot delete your own admin account");
  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new HttpError(404, "User not found");

  await prisma.$transaction(async (tx) => {
    const salons = await tx.salon.findMany({ where: { ownerId: id }, select: { id: true } });
    const salonIds = salons.map((salon) => salon.id);
    const bookings = await tx.booking.findMany({
      where: { OR: [{ clientId: id }, ...(salonIds.length ? [{ salonId: { in: salonIds } }] : [])] },
      select: { id: true },
    });
    const bookingIds = bookings.map((booking) => booking.id);

    await tx.notification.deleteMany({ where: { userId: id } });
    if (bookingIds.length) {
      await tx.payment.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await tx.review.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await tx.bookingService.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
    }
    if (salonIds.length) {
      await tx.review.deleteMany({ where: { salonId: { in: salonIds } } });
      await tx.service.deleteMany({ where: { salonId: { in: salonIds } } });
      await tx.salonImage.deleteMany({ where: { salonId: { in: salonIds } } });
      await tx.employee.deleteMany({ where: { salonId: { in: salonIds } } });
      await tx.salon.deleteMany({ where: { id: { in: salonIds } } });
    }
    await tx.review.deleteMany({ where: { clientId: id } });
    await tx.userAddress.deleteMany({ where: { userId: id } });
    await tx.user.delete({ where: { id } });
  });

  res.status(204).send();
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
