import { DisputeStatus, SalonStatus, UserRole } from "@prisma/client";
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

router.get("/salons", asyncHandler(async (_req, res) => {
  const salons = await prisma.salon.findMany({
    include: {
      owner: { select: { id: true, name: true, phone: true, email: true, isSuspended: true } },
      images: true,
      services: true,
      reviews: { select: { rating: true } },
      bookings: { include: { payment: true } },
      _count: { select: { bookings: true, services: true, employees: true, reviews: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(salons.map((salon) => ({
    ...salon,
    rating: salon.reviews.length ? salon.reviews.reduce((sum, review) => sum + review.rating, 0) / salon.reviews.length : null,
    paidRevenue: salon.bookings.reduce((sum, booking) => sum + (booking.payment?.status === "PAID" ? booking.payment.amount : 0), 0),
    activeBookings: salon.bookings.filter((booking) => ["PENDING", "ACCEPTED"].includes(booking.status)).length,
    completedBookings: salon.bookings.filter((booking) => booking.status === "COMPLETED").length,
  })));
}));

router.patch("/salons/:id/status", asyncHandler(async (req, res) => {
  const data = z.object({ status: z.nativeEnum(SalonStatus) }).parse(req.body);
  const salon = await prisma.salon.findUnique({ where: { id: String(req.params.id) } });
  if (!salon) throw new HttpError(404, "Salon not found");
  res.json(await prisma.salon.update({
    where: { id: salon.id },
    data: { status: data.status, isVerified: data.status === "APPROVED" },
    include: {
      owner: { select: { id: true, name: true, phone: true, email: true, isSuspended: true } },
      images: true,
      services: true,
      reviews: { select: { rating: true } },
      bookings: { include: { payment: true } },
      _count: { select: { bookings: true, services: true, employees: true, reviews: true } },
    },
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
  res.json(await prisma.booking.findMany({
    include: {
      client: { select: { id: true, name: true, phone: true, email: true, isSuspended: true } },
      salon: { include: { owner: { select: { id: true, name: true, phone: true, email: true, isSuspended: true } } } },
      employee: true,
      service: true,
      services: { include: { service: true } },
      payment: true,
      review: true,
    },
    orderBy: { createdAt: "desc" },
  }));
}));

router.patch("/bookings/:id/dispute", asyncHandler(async (req, res) => {
  const data = z.object({
    disputeStatus: z.nativeEnum(DisputeStatus),
    disputeNote: z.string().trim().max(500).optional().or(z.literal("")),
  }).parse(req.body);
  const booking = await prisma.booking.findUnique({ where: { id: String(req.params.id) } });
  if (!booking) throw new HttpError(404, "Booking not found");
  res.json(await prisma.booking.update({
    where: { id: booking.id },
    data: {
      disputeStatus: data.disputeStatus,
      disputeNote: data.disputeNote || null,
      disputeResolvedAt: data.disputeStatus === "RESOLVED" ? new Date() : null,
    },
    include: {
      client: { select: { id: true, name: true, phone: true, email: true, isSuspended: true } },
      salon: { include: { owner: { select: { id: true, name: true, phone: true, email: true, isSuspended: true } } } },
      employee: true,
      service: true,
      services: { include: { service: true } },
      payment: true,
      review: true,
    },
  }));
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

router.patch("/payments/:id/commission", asyncHandler(async (req, res) => {
  const data = z.object({ commissionRate: z.coerce.number().int().min(0).max(100) }).parse(req.body);
  const payment = await prisma.payment.findUnique({
    where: { id: String(req.params.id) },
  });
  if (!payment) throw new HttpError(404, "Payment not found");
  const platformFee = Math.round((payment.amount * data.commissionRate) / 100);
  res.json(await prisma.payment.update({
    where: { id: payment.id },
    data: {
      commissionRate: data.commissionRate,
      platformFee,
      merchantAmount: payment.amount - platformFee,
    },
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
  }));
}));

export default router;
