import { DisputeStatus, SalonStatus, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Request, Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import { adminWriteLimiter } from "../../middleware/rate-limit.middleware";
import { auditLog } from "../../services/audit.service";
import { asyncHandler } from "../../utils/async-handler";
import { HttpError } from "../../utils/http-error";

const router = Router();
router.use(requireAuth, requireRole(UserRole.ADMIN));
router.use(["/salons/:id/status", "/users/:id/suspension", "/users/:id", "/bookings/:id/dispute", "/payments/:id/commission"], adminWriteLimiter);

const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

async function requireAdminPassword(req: Request) {
  const { adminPassword } = z.object({ adminPassword: z.string().min(1) }).parse(req.body);
  const admin = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { password: true } });
  if (!admin?.password || !(await bcrypt.compare(adminPassword, admin.password))) {
    throw new HttpError(403, "Admin password confirmation failed");
  }
}

router.get("/overview", asyncHandler(async (_req, res) => {
  const [users, salons, bookings, payments, onlinePayments, cashPayments] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.salon.count({ where: { owner: { deletedAt: null } } }),
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

router.get("/users", asyncHandler(async (req, res) => {
  const query = pageQuerySchema.parse(req.query);
  const where = { deletedAt: null };
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
    where,
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
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  }),
  ]);
  res.setHeader("X-Total-Count", total);
  res.json(users);
}));

router.get("/salons", asyncHandler(async (req, res) => {
  const query = pageQuerySchema.parse(req.query);
  const where = { owner: { deletedAt: null } };
  const [total, salons] = await Promise.all([
    prisma.salon.count({ where }),
    prisma.salon.findMany({
    where,
    include: {
      owner: { select: { id: true, name: true, phone: true, email: true, isSuspended: true } },
      images: true,
      services: true,
      reviews: { select: { rating: true } },
      bookings: { include: { payment: true } },
      _count: { select: { bookings: true, services: true, employees: true, reviews: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  }),
  ]);
  res.setHeader("X-Total-Count", total);
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
  const updated = await prisma.salon.update({
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
  });
  await auditLog({ req, action: "SALON_STATUS_UPDATED", entity: "Salon", entityId: salon.id, metadata: { status: data.status } });
  res.json(updated);
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
  await auditLog({ req, action: data.isSuspended ? "USER_SUSPENDED" : "USER_REACTIVATED", entity: "User", entityId: id });
  res.json(user);
}));

router.delete("/users/:id", asyncHandler(async (req, res) => {
  await requireAdminPassword(req);
  const id = String(req.params.id);
  if (id === req.user!.id) throw new HttpError(400, "You cannot delete your own admin account");
  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
  if (!existing) throw new HttpError(404, "User not found");
  if (existing.deletedAt) throw new HttpError(400, "User is already deleted");

  await prisma.user.update({ where: { id }, data: { deletedAt: new Date(), isSuspended: true, sessionVersion: { increment: 1 } } });
  await auditLog({ req, action: "USER_DELETED", entity: "User", entityId: id });

  res.status(204).send();
}));

router.get("/bookings", asyncHandler(async (req, res) => {
  const query = pageQuerySchema.parse(req.query);
  const where = { client: { deletedAt: null }, salon: { owner: { deletedAt: null } } };
  const [total, bookings] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
    where,
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
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  }),
  ]);
  res.setHeader("X-Total-Count", total);
  res.json(bookings);
}));

router.patch("/bookings/:id/dispute", asyncHandler(async (req, res) => {
  const data = z.object({
    disputeStatus: z.nativeEnum(DisputeStatus),
    disputeNote: z.string().trim().max(500).optional().or(z.literal("")),
  }).parse(req.body);
  const booking = await prisma.booking.findUnique({ where: { id: String(req.params.id) } });
  if (!booking) throw new HttpError(404, "Booking not found");
  const updated = await prisma.booking.update({
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
  });
  await auditLog({ req, action: "BOOKING_DISPUTE_UPDATED", entity: "Booking", entityId: booking.id, metadata: { disputeStatus: data.disputeStatus } });
  res.json(updated);
}));

router.get("/payments", asyncHandler(async (req, res) => {
  const query = pageQuerySchema.parse(req.query);
  const where = { status: "PAID" as const, booking: { client: { deletedAt: null }, salon: { owner: { deletedAt: null } } } };
  const [total, payments] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
    where,
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
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  }),
  ]);
  res.setHeader("X-Total-Count", total);
  res.json(payments);
}));

router.get("/audit-logs", asyncHandler(async (req, res) => {
  const query = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    entity: z.string().trim().optional(),
    actorId: z.string().trim().optional(),
  }).parse(req.query);
  res.json(await prisma.auditLog.findMany({
    where: {
      ...(query.entity && { entity: query.entity }),
      ...(query.actorId && { actorId: query.actorId }),
    },
    orderBy: { createdAt: "desc" },
    take: query.limit,
  }));
}));

router.patch("/payments/:id/commission", asyncHandler(async (req, res) => {
  await requireAdminPassword(req);
  const data = z.object({ commissionRate: z.coerce.number().int().min(0).max(100) }).parse(req.body);
  const payment = await prisma.payment.findUnique({
    where: { id: String(req.params.id) },
  });
  if (!payment) throw new HttpError(404, "Payment not found");
  const platformFee = Math.round((payment.amount * data.commissionRate) / 100);
  const updated = await prisma.payment.update({
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
  });
  await auditLog({ req, action: "PAYMENT_COMMISSION_UPDATED", entity: "Payment", entityId: payment.id, metadata: { commissionRate: data.commissionRate, platformFee } });
  res.json(updated);
}));

export default router;
