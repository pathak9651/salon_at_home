import crypto from "node:crypto";
import { BookingStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import Razorpay from "razorpay";
import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../utils/async-handler";
import { HttpError } from "../../utils/http-error";

const router = Router();
router.use(requireAuth);

type AuthedUser = { id: string; role: UserRole };

const paymentInclude = {
  booking: {
    include: {
      salon: { include: { owner: { select: { id: true, name: true, phone: true, email: true } } } },
      service: true,
      services: { include: { service: true } },
      client: { select: { id: true, name: true, phone: true, email: true } },
    },
  },
};

function splitAmount(amount: number) {
  const platformFee = Math.round((amount * env.PLATFORM_COMMISSION_PERCENT) / 100);
  return {
    platformFee,
    merchantAmount: amount - platformFee,
    commissionRate: env.PLATFORM_COMMISSION_PERCENT,
  };
}

function invoiceNumber() {
  return `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function paymentAccessWhere(user: AuthedUser) {
  if (user.role === UserRole.ADMIN) return {};
  if (user.role === UserRole.OWNER) return { booking: { salon: { ownerId: user.id } } };
  return { booking: { clientId: user.id } };
}

router.get("/", asyncHandler(async (req, res) => {
  res.json(await prisma.payment.findMany({
    where: paymentAccessWhere(req.user!),
    include: paymentInclude,
    orderBy: { updatedAt: "desc" },
  }));
}));

router.get("/:id/invoice", asyncHandler(async (req, res) => {
  const payment = await prisma.payment.findFirst({
    where: { id: String(req.params.id), status: "PAID", ...paymentAccessWhere(req.user!) },
    include: paymentInclude,
  });
  if (!payment) throw new HttpError(404, "Paid invoice not found");
  res.json({
    invoiceNumber: payment.invoiceNumber,
    paidAt: payment.paidAt,
    currency: payment.currency,
    amount: payment.amount,
    platformFee: payment.platformFee,
    merchantAmount: payment.merchantAmount,
    commissionRate: payment.commissionRate,
    method: payment.method,
    cashRemark: payment.cashRemark,
    collectedById: payment.collectedById,
    settlementStatus: payment.settlementStatus,
    razorpayPayment: payment.razorpayPayment,
    booking: payment.booking,
  });
}));

router.post("/order", asyncHandler(async (req, res) => {
  const { bookingId } = z.object({ bookingId: z.string() }).parse(req.body);
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, clientId: req.user!.id }, include: { payment: true } });
  if (!booking) throw new HttpError(404, "Booking not found");
  if (booking.status !== BookingStatus.COMPLETED) throw new HttpError(400, "Payment is available only after the service is completed");
  if (booking.payment?.status === "PAID") throw new HttpError(400, "This booking is already closed for payment");
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw new HttpError(503, "Payment provider not configured");
  const razorpay = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  const split = splitAmount(booking.totalAmount);
  const order = await razorpay.orders.create({
    amount: booking.totalAmount * 100,
    currency: "INR",
    receipt: `booking_${booking.id.slice(0, 24)}`,
    notes: { bookingId: booking.id, commissionPercent: String(env.PLATFORM_COMMISSION_PERCENT) },
  });
  const payment = await prisma.payment.upsert({
    where: { bookingId },
    update: { razorpayOrder: order.id, amount: booking.totalAmount, ...split },
    create: { bookingId, razorpayOrder: order.id, amount: booking.totalAmount, ...split },
  });
  res.json({ order, keyId: env.RAZORPAY_KEY_ID, payment });
}));

router.post("/verify", asyncHandler(async (req, res) => {
  const data = z.object({
    bookingId: z.string(),
    razorpayOrderId: z.string(),
    razorpayPaymentId: z.string(),
    razorpaySignature: z.string(),
  }).parse(req.body);
  if (!env.RAZORPAY_KEY_SECRET) throw new HttpError(503, "Payment provider not configured");
  const payment = await prisma.payment.findFirst({
    where: {
      bookingId: data.bookingId,
      razorpayOrder: data.razorpayOrderId,
      booking: { clientId: req.user!.id },
    },
    include: { booking: true },
  });
  if (!payment) throw new HttpError(404, "Payment order not found");
  if (payment.booking.status !== BookingStatus.COMPLETED) throw new HttpError(400, "Payment is available only after service completion");
  const expected = crypto.createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${data.razorpayOrderId}|${data.razorpayPaymentId}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(data.razorpaySignature, "hex");
  if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    throw new HttpError(400, "Invalid payment signature");
  }
  res.json(await prisma.payment.update({
    where: { bookingId: data.bookingId },
    data: { status: "PAID", method: "ONLINE", razorpayPayment: data.razorpayPaymentId, invoiceNumber: invoiceNumber(), paidAt: new Date(), ...splitAmount(payment.amount) },
    include: paymentInclude,
  }));
}));

router.post("/cash", asyncHandler(async (req, res) => {
  const data = z.object({
    bookingId: z.string(),
    remark: z.string().trim().min(3, "Add a cash collection remark").max(300),
  }).parse(req.body);
  const booking = await prisma.booking.findFirst({
    where: { id: data.bookingId, salon: { ownerId: req.user!.id } },
    include: { payment: true, salon: true },
  });
  if (!booking) throw new HttpError(404, "Booking not found");
  if (req.user!.role !== UserRole.OWNER) throw new HttpError(403, "Only merchants can close bookings with cash");
  const cashClosableStatuses: BookingStatus[] = [BookingStatus.ACCEPTED, BookingStatus.COMPLETED];
  if (!cashClosableStatuses.includes(booking.status)) {
    throw new HttpError(400, "Cash collection is allowed only for accepted or completed bookings");
  }
  if (booking.payment?.status === "PAID") throw new HttpError(400, "This booking is already closed for payment");

  const split = splitAmount(booking.totalAmount);
  const payment = await prisma.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: booking.id }, data: { status: BookingStatus.COMPLETED } });
    return tx.payment.upsert({
      where: { bookingId: booking.id },
      update: {
        amount: booking.totalAmount,
        status: "PAID",
        method: "CASH",
        invoiceNumber: invoiceNumber(),
        paidAt: new Date(),
        cashRemark: data.remark,
        collectedById: req.user!.id,
        ...split,
      },
      create: {
        bookingId: booking.id,
        amount: booking.totalAmount,
        status: "PAID",
        method: "CASH",
        invoiceNumber: invoiceNumber(),
        paidAt: new Date(),
        cashRemark: data.remark,
        collectedById: req.user!.id,
        ...split,
      },
      include: paymentInclude,
    });
  });
  res.status(201).json(payment);
}));

export default router;
